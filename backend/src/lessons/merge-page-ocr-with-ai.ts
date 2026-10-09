import { countLatinLetters } from '../common/extract-quality';
import { readEnv } from '../common/env';
import { parseModelJson } from '../ai/parse-model-json';
import {
  mergePaddleAndTesseractPageOcr,
  scoreOcrMergeCoverage,
} from './merge-paddle-tesseract-ocr';
import {
  criticalPageCueHits,
  isPagePhotoTextReadable,
} from './page-text-sanitize';

const PAGE_OCR_MERGE_SYSTEM = `You merge OCR transcripts of the SAME English textbook page into one clean reading.
Return JSON only: { "lessonText": "..." }

Hard rules:
- Include Pre-reading questions, "Reading text", title, full story paragraphs, and dialogue.
- If EITHER transcript has an opening like "Akhtar came home..." / "feeling cross" / story start BEFORE the uncle visit, you MUST include that opening. Never start the story at "down to lunch" if an earlier paragraph exists in Tesseract or Combined OCR.
- Prefer Combined OCR for coverage; use Paddle for clean spelling of dialogue lines; use Tesseract to fill missing story sentences Paddle skipped.
- Format dialogue as:
  Akhtar: ...
  Uncle: ...
- STOP before "Exercise 1" / workbook exercises / "Note for teachers".
- Fix obvious OCR typos only. Do NOT invent plot, names, or lines that appear in no transcript.
- Keep paragraph breaks. Deduplicate repeated lines.`;

export function stripWorkbookExercisesFromPage(text: string): string {
  const value = (text ?? '').trim();
  if (!value) return '';
  const lines = value.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    if (/^\s*Exercise\s*1\b/i.test(line.trim())) {
      break;
    }
    if (/^\s*Note for teachers?\b/i.test(line.trim())) {
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

/** Prefer coverage-aware rule merge; never let short clean Paddle erase fuller Combined OCR. */
export function pickStrongerRuleMerge(paddle: string, tesseract: string, rule: string): string {
  const r = (rule ?? '').trim();
  const p = (paddle ?? '').trim();
  const t = (tesseract ?? '').trim();
  if (r) {
    const rScore = scoreOcrMergeCoverage(r);
    const pScore = scoreOcrMergeCoverage(p);
    const tScore = scoreOcrMergeCoverage(t);
    // Keep combined unless a single engine is clearly richer in cues+length.
    if (rScore >= pScore - 40 && rScore >= tScore - 40) return r;
    if (tScore > rScore + 80 && tScore >= pScore) return t;
    if (pScore > rScore + 80 && pScore > tScore + 40 && countLatinLetters(p) >= 400) return p;
    return r;
  }
  if (scoreOcrMergeCoverage(t) >= scoreOcrMergeCoverage(p)) return t || p;
  return p || t;
}

function sourceHasOpeningStory(text: string): boolean {
  return /akhtar came home/i.test(text) || /feeling cross/i.test(text);
}

function aiMissingRequiredSourceCues(ai: string, sources: string[]): boolean {
  const blob = sources.join('\n');
  if (sourceHasOpeningStory(blob) && !sourceHasOpeningStory(ai)) return true;
  if (/social service week/i.test(blob) && !/social service/i.test(ai)) return true;
  if (/dignity of work/i.test(blob) && !/dignity of work/i.test(ai)) return true;
  // AI much shorter than combined coverage → likely dropped story body.
  const maxLatin = Math.max(...sources.map((s) => countLatinLetters(s)), 0);
  if (maxLatin >= 500 && countLatinLetters(ai) < maxLatin * 0.35) return true;
  return false;
}

async function callCursorJsonMerge(userPrompt: string): Promise<string> {
  const apiKey = readEnv('CURSOR_API_KEY')?.trim();
  if (!apiKey) {
    throw new Error('CURSOR_API_KEY not set');
  }
  const modelId =
    readEnv('OCR_MERGE_MODEL')?.trim() ||
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
  const model = readEnv('OCR_MERGE_MODEL')?.trim() || readEnv('OPENAI_MODEL')?.trim() || 'gpt-4o-mini';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
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

/** Prefer OpenAI (faster) when available; Cursor otherwise. */
async function callAiJsonMerge(userPrompt: string): Promise<string> {
  if (readEnv('OPENAI_API_KEY')?.trim()) {
    return callOpenAiJsonMerge(userPrompt);
  }
  return callCursorJsonMerge(userPrompt);
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
 * Coverage-aware Paddle+Tesseract merge, then fast AI polish (OpenAI preferred).
 * Output is lesson reading only (exercises stripped).
 */
export async function intelligentMergePageOcrTranscripts(
  input: IntelligentPageOcrMergeInput,
): Promise<{ merged: string; usedAi: boolean }> {
  const paddle = (input.paddle ?? '').trim();
  const tesseract = (input.tesseract ?? '').trim();
  const rule = mergePaddleAndTesseractPageOcr(paddle, tesseract);
  const ruleFallback = stripWorkbookExercisesFromPage(
    pickStrongerRuleMerge(paddle, tesseract, rule),
  );

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
    '--- Combined OCR (coverage-aware merge — prefer for story coverage) ---',
    ruleFallback || '(empty)',
    '',
    '--- PaddleOCR (cleaner dialogue spelling) ---',
    paddle || '(empty)',
    '',
    '--- Tesseract (often has missing opening paragraphs) ---',
    tesseract || '(empty)',
    input.orientHint?.trim()
      ? `\n--- Orientation OCR hint ---\n${input.orientHint.trim()}`
      : '',
    input.visionText?.trim()
      ? `\n--- Vision transcript ---\n${input.visionText.trim()}`
      : '',
    '',
    'Write lessonText now. If Tesseract/Combined contain "Akhtar came home", that opening MUST appear before the uncle visit.',
  ].join('\n');

  try {
    const aiText = await callAiJsonMerge(userPrompt);
    const cleaned = stripWorkbookExercisesFromPage(aiText);
    const sources = [ruleFallback, paddle, tesseract, input.visionText ?? ''];
    if (aiMissingRequiredSourceCues(cleaned, sources)) {
      // Reject thin/incomplete AI; keep coverage-aware rule merge.
      if (ruleFallback.length >= 80) {
        return { merged: ruleFallback, usedAi: false };
      }
    }
    if (cleaned.length >= 40 && isPagePhotoTextReadable(cleaned)) {
      // Prefer AI when it kept more cues than rule, or is at least as long.
      if (
        criticalPageCueHits(cleaned) >= criticalPageCueHits(ruleFallback) - 1 ||
        cleaned.length >= ruleFallback.length * 0.85
      ) {
        return { merged: cleaned, usedAi: true };
      }
    }
    if (cleaned.length >= ruleFallback.length * 0.7 && !aiMissingRequiredSourceCues(cleaned, sources)) {
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
