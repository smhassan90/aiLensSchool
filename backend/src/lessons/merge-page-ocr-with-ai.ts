import { readEnv } from '../common/env';
import { parseModelJson } from '../ai/parse-model-json';
import { mergePaddleAndTesseractPageOcr } from './merge-paddle-tesseract-ocr';
import { isPagePhotoTextReadable, scorePageOcrQuality } from './page-text-sanitize';

const PAGE_OCR_MERGE_SYSTEM = `You merge OCR transcripts of the same English textbook page into one clean reading.
Return JSON: { "lessonText": "..." }

Rules:
- Include pre-reading, reading text, story, and dialogue (character names with lines).
- STOP before "Exercise 1" or numbered workbook exercises — do not include exercises.
- Combine PaddleOCR and Tesseract; fix obvious OCR typos using both sources.
- Deduplicate repeated lines. Keep paragraph breaks.
- Do not invent content that is not supported by at least one transcript.
- If a third "vision" transcript is provided, prefer it for spelling when OCR disagrees.`;

export function stripWorkbookExercisesFromPage(text: string): string {
  const value = (text ?? '').trim();
  if (!value) return '';
  const lines = value.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    if (/^\s*Exercise\s*1\b/i.test(line.trim())) {
      break;
    }
    kept.push(line);
  }
  const trimmed = kept
    .join('\n')
    .replace(/^\s*READING\s+COMPREHENSION\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (trimmed) return trimmed;
  const exerciseStart = value.search(/\bExercise\s*1\b/i);
  if (exerciseStart > 40) {
    return value.slice(0, exerciseStart).trim();
  }
  return value;
}

function pickStrongerRuleMerge(paddle: string, tesseract: string, rule: string): string {
  const candidates = [rule, paddle, tesseract].map((s) => s.trim()).filter(Boolean);
  if (!candidates.length) return '';
  return candidates.sort(
    (a, b) => scorePageOcrQuality(b) - scorePageOcrQuality(a) || b.length - a.length,
  )[0];
}

async function callCursorJsonMerge(userPrompt: string): Promise<string> {
  const apiKey = readEnv('CURSOR_API_KEY')?.trim();
  if (!apiKey) {
    throw new Error('CURSOR_API_KEY not set');
  }
  const modelId =
    readEnv('CURSOR_JSON_MODEL')?.trim() ||
    readEnv('CURSOR_MODEL')?.trim() ||
    'composer-2.5';
  const { Agent, JsonlLocalAgentStore } = await import('@cursor/sdk');
  const cwd = process.cwd();
  const storeDir = `${cwd}/.cursor-ocr-merge-agent`;
  const result = await Agent.prompt(
    `${PAGE_OCR_MERGE_SYSTEM}\n\n${userPrompt}\n\nReturn ONLY valid JSON.`,
    {
      apiKey,
      model: { id: modelId },
      local: { cwd, store: new JsonlLocalAgentStore(storeDir) },
    },
  );
  if (result.status !== 'finished' || !result.result?.trim()) {
    throw new Error(`Cursor merge agent ${result.status ?? 'failed'}`);
  }
  const parsed = parseModelJson(result.result) as { lessonText?: string };
  const lessonText = typeof parsed.lessonText === 'string' ? parsed.lessonText.trim() : '';
  if (!lessonText) {
    throw new Error('Cursor merge returned empty lessonText');
  }
  return lessonText;
}

async function callOpenAiJsonMerge(userPrompt: string): Promise<string> {
  const apiKey = readEnv('OPENAI_API_KEY')?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }
  const model = readEnv('OPENAI_MODEL')?.trim() || 'gpt-4o-mini';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PAGE_OCR_MERGE_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI merge failed: ${response.status}`);
  }
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content ?? '{}';
  const parsed = parseModelJson(text) as { lessonText?: string };
  const lessonText = typeof parsed.lessonText === 'string' ? parsed.lessonText.trim() : '';
  if (!lessonText) {
    throw new Error('OpenAI merge returned empty lessonText');
  }
  return lessonText;
}

export type IntelligentPageOcrMergeInput = {
  paddle: string;
  tesseract: string;
  orientHint?: string;
  visionText?: string;
  subjectName?: string | null;
  skipAi?: boolean;
};

/**
 * Rule-based Paddle+Tesseract merge, optionally refined by AI (Cursor or OpenAI).
 * Output is lesson reading only (exercises stripped).
 */
export async function intelligentMergePageOcrTranscripts(
  input: IntelligentPageOcrMergeInput,
): Promise<{ merged: string; usedAi: boolean }> {
  const paddle = (input.paddle ?? '').trim();
  const tesseract = (input.tesseract ?? '').trim();
  const rule = mergePaddleAndTesseractPageOcr(paddle, tesseract);
  const ruleFallback = stripWorkbookExercisesFromPage(pickStrongerRuleMerge(paddle, tesseract, rule));

  if (input.skipAi || readEnv('OCR_AI_MERGE') === '0') {
    return { merged: ruleFallback, usedAi: false };
  }

  const hasAi = Boolean(readEnv('CURSOR_API_KEY')?.trim() || readEnv('OPENAI_API_KEY')?.trim());
  if (!hasAi || (!paddle && !tesseract && !input.visionText?.trim())) {
    return { merged: ruleFallback, usedAi: false };
  }

  const userPrompt = [
    `Subject: ${input.subjectName ?? 'English'}`,
    '',
    '--- PaddleOCR ---',
    paddle || '(empty)',
    '',
    '--- Tesseract ---',
    tesseract || '(empty)',
    input.orientHint?.trim()
      ? `\n--- Orientation OCR hint ---\n${input.orientHint.trim()}`
      : '',
    input.visionText?.trim()
      ? `\n--- Vision transcript ---\n${input.visionText.trim()}`
      : '',
  ].join('\n');

  try {
    const aiText = readEnv('OPENAI_API_KEY')?.trim()
      ? await callOpenAiJsonMerge(userPrompt)
      : await callCursorJsonMerge(userPrompt);
    const cleaned = stripWorkbookExercisesFromPage(aiText);
    if (cleaned.length >= 40 && isPagePhotoTextReadable(cleaned)) {
      return { merged: cleaned, usedAi: true };
    }
    if (cleaned.length >= ruleFallback.length * 0.7) {
      return { merged: cleaned, usedAi: true };
    }
  } catch {
    // fall through to rule merge
  }

  return { merged: ruleFallback, usedAi: false };
}

/** Join per-page lesson bodies into one chapter reading (no exercises). */
export function assembleChapterLessonFromPageTexts(pageTexts: string[]): string {
  const blocks = pageTexts
    .map((p) => stripWorkbookExercisesFromPage(p.trim()))
    .filter((p) => p.length >= 20);
  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}
