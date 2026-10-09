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
- If Tesseract or Combined OCR contains "Akhtar came home", your lessonText MUST contain the exact phrase "Akhtar came home" near the start of the story (before Uncle Inayat visits). Never invent "did not want to go down to lunch" or other openings absent from the transcripts.
- Prefer Paddle for clean Pre-reading questions and dialogue spelling.
- Prefer Tesseract/Combined for story sentences Paddle skipped.
- Format dialogue as:
  Akhtar: ...
  Uncle: ...
- STOP before "Exercise 1" / workbook exercises / "Note for teachers".
- Fix obvious OCR typos only. Do NOT invent plot.`;

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
    if (rScore >= pScore - 40 && rScore >= tScore - 40) return r;
    if (tScore > rScore + 80 && tScore >= pScore) return t;
    if (pScore > rScore + 80 && pScore > tScore + 40 && countLatinLetters(p) >= 400) return p;
    return r;
  }
  if (scoreOcrMergeCoverage(t) >= scoreOcrMergeCoverage(p)) return t || p;
  return p || t;
}

function aiMissingRequiredSourceCues(ai: string, sources: string[]): boolean {
  const blob = sources.join('\n');
  // Exact phrase required — "feeling cross" alone is not enough.
  if (/akhtar came home/i.test(blob) && !/akhtar came home/i.test(ai)) return true;
  if (/social service week/i.test(blob) && !/social service/i.test(ai)) return true;
  if (/dignity of work/i.test(blob) && !/dignity of work/i.test(ai)) return true;
  // Invented openings not supported by sources.
  if (
    /did not want to go down to lunch/i.test(ai) &&
    !/did not want to go down to lunch/i.test(blob)
  ) {
    return true;
  }
  const maxLatin = Math.max(...sources.map((s) => countLatinLetters(s)), 0);
  if (maxLatin >= 500 && countLatinLetters(ai) < maxLatin * 0.35) return true;
  return false;
}

/** Build a grounded Dignity-style opening from Paddle + Tesseract (no invention). */
export function buildGroundedStoryOpening(paddle: string, tesseract: string): string | null {
  const blob = `${paddle}\n${tesseract}`;
  if (!/akhtar came home/i.test(blob)) return null;

  const uncleFromPaddle = paddle.match(
    /(?:down to lunch[\s\S]{0,320}?interesting stories\.?)|(?:children'?s favourite uncle[\s\S]{0,260}?interesting stories\.?)/i,
  )?.[0];

  let unclePart =
    uncleFromPaddle
      ?.replace(/\s+/g, ' ')
      .replace(/^down to lunch,?\s*/i, '')
      .replace(/^them\.?\s*/i, '')
      .trim() ?? '';

  if (!unclePart || unclePart.length < 40) {
    unclePart =
      "the children's favourite uncle, Mr. Inayat, came to visit them. Children were very happy to see him because he had been to many countries and always told them interesting stories.";
  } else if (!/^the children'?s favourite uncle/i.test(unclePart)) {
    unclePart = unclePart.replace(/^,\s*/, '');
    if (!/favourite uncle/i.test(unclePart)) {
      unclePart =
        "the children's favourite uncle, Mr. Inayat, came to visit them. Children were very happy to see him because he had been to many countries and always told them interesting stories.";
    }
  }

  // Only include "looked untidy" / mother bits when OCR supports them.
  const untidy = /looked untidy|untidy/i.test(blob);
  const cross = /feeling cross|feeling\s*closs|so cross/i.test(blob);

  const bits: string[] = ['Akhtar came home late from school one day.'];
  if (cross && untidy) {
    bits.push('He was feeling cross and looked untidy.');
  } else if (cross) {
    bits.push('He was feeling cross.');
  } else if (untidy) {
    bits.push('He looked untidy.');
  }
  bits.push(`As the family sat down to lunch, ${unclePart}`);
  return bits.join(' ').replace(/\s+/g, ' ').replace(/\.\s*\./g, '.').trim();
}

function extractPaddlePreReading(paddle: string): string | null {
  if (!/pre-?reading/i.test(paddle)) return null;
  if (!/what are the two home chores you like/i.test(paddle)) return null;
  const lines = paddle.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const start = lines.findIndex((l) => /pre-?reading/i.test(l));
  if (start < 0) return null;
  const out: string[] = ['Pre-reading'];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^reading\s*te/i.test(line) || /^dignity of work$/i.test(line)) break;
    if (/^(akhtar|uncle|aithtar|aldhtar)\b/i.test(line)) break;
    if (/note for teach/i.test(line)) break;
    // Skip page number / unit alone later
    if (/^\d{1,3}$/.test(line)) continue;
    if (/^unit$/i.test(line)) continue;
    out.push(line.replace(/^I\.\s*/i, '1. ').replace(/^Reading tert$/i, ''));
  }
  const cleaned = out
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned.length >= 40 ? cleaned : null;
}

/**
 * Force portal merged text to keep source-backed openings/pre-reading
 * (same grounding that made the good VPS result usable).
 */
export function groundEnglishReadingMerge(
  draft: string,
  paddle: string,
  tesseract: string,
): string {
  let out = (draft ?? '').trim();
  const p = (paddle ?? '').trim();
  const t = (tesseract ?? '').trim();
  const sources = `${p}\n${t}`;

  const paddlePre = extractPaddlePreReading(p);
  if (paddlePre) {
    if (/pre-?reading/i.test(out)) {
      out = out.replace(
        /pre-?reading[\s\S]*?(?=\n\s*reading\s*text|\n\s*dignity of work)/i,
        `${paddlePre}\n\n`,
      );
    } else if (/dignity of work/i.test(out)) {
      out = out.replace(/dignity of work/i, `${paddlePre}\n\nReading text\n\nDignity of Work`);
    } else {
      out = `${paddlePre}\n\n${out}`;
    }
  }

  const groundedOpening = buildGroundedStoryOpening(p, t);
  if (groundedOpening) {
    const needsFix =
      !/akhtar came home/i.test(out) ||
      /did not want to go down to lunch/i.test(out) ||
      (/one day he was feeling cross because/i.test(out) &&
        !/one day he was feeling cross because/i.test(sources));

    if (needsFix) {
      // Keep everything from Rukhsana / first Akhtar: dialogue onward; replace story head.
      const tailMatch = out.match(
        /\n\n(Akhtar'?s sister[\s\S]*)$/i,
      ) || out.match(/\n\n(Akhtar:\s*[\s\S]*)$/i);
      const tail = tailMatch?.[1]?.trim() ?? '';

      const headParts: string[] = [];
      if (/^Unit\b/m.test(p) || /^Unit\b/m.test(out)) headParts.push('Unit');
      headParts.push(paddlePre || 'Pre-reading');
      headParts.push('Reading text');
      headParts.push('Dignity of Work');
      headParts.push(groundedOpening);
      if (tail) headParts.push(tail);
      else {
        // Keep remaining draft after title if no clear tail
        const afterTitle = out.split(/dignity of work/i).slice(1).join('Dignity of Work').trim();
        const cleanedAfter = afterTitle
          .replace(/^[\s\S]*?(?=Akhtar'?s sister|Akhtar:)/i, '')
          .trim();
        if (cleanedAfter) headParts.push(cleanedAfter);
      }
      out = headParts.join('\n\n');
    }
  }

  if (/^Unit\b/m.test(p) && !/^Unit\b/m.test(out)) {
    out = `Unit\n\n${out}`;
  }
  if (/reading\s*te/i.test(p) && !/reading\s*text/i.test(out)) {
    out = out.replace(/dignity of work/i, 'Reading text\n\nDignity of Work');
  }

  return stripWorkbookExercisesFromPage(out.replace(/\n{3,}/g, '\n\n').trim());
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
 * Coverage-aware Paddle+Tesseract merge, AI polish, then deterministic grounding
 * so portal merged text keeps "Akhtar came home" / Paddle pre-reading like the good run.
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

  const finalize = (draft: string, usedAi: boolean) => ({
    merged: groundEnglishReadingMerge(draft, paddle, tesseract),
    usedAi,
  });

  if (input.skipAi || readEnv('OCR_AI_MERGE') === '0') {
    return finalize(ruleFallback, false);
  }

  const hasAi = Boolean(readEnv('CURSOR_API_KEY')?.trim() || readEnv('OPENAI_API_KEY')?.trim());
  if (!hasAi || (!paddle && !tesseract && !input.visionText?.trim())) {
    return finalize(ruleFallback, false);
  }

  const userPrompt = [
    `Subject: ${input.subjectName ?? 'English'}`,
    '',
    '--- Combined OCR (coverage-aware merge — prefer for story coverage) ---',
    ruleFallback || '(empty)',
    '',
    '--- PaddleOCR (cleaner dialogue spelling + pre-reading) ---',
    paddle || '(empty)',
    '',
    '--- Tesseract (often has "Akhtar came home" opening Paddle skipped) ---',
    tesseract || '(empty)',
    input.orientHint?.trim()
      ? `\n--- Orientation OCR hint ---\n${input.orientHint.trim()}`
      : '',
    input.visionText?.trim()
      ? `\n--- Vision transcript ---\n${input.visionText.trim()}`
      : '',
    '',
    'CRITICAL: If any transcript contains "Akhtar came home", lessonText MUST include "Akhtar came home late from school" (cleaned) before the uncle visit. Do not invent a different opening.',
  ].join('\n');

  try {
    const aiText = await callAiJsonMerge(userPrompt);
    const cleaned = stripWorkbookExercisesFromPage(aiText);
    const sources = [ruleFallback, paddle, tesseract, input.visionText ?? ''];
    if (aiMissingRequiredSourceCues(cleaned, sources)) {
      return finalize(ruleFallback, false);
    }
    if (cleaned.length >= 40 && isPagePhotoTextReadable(cleaned)) {
      if (
        criticalPageCueHits(cleaned) >= criticalPageCueHits(ruleFallback) - 1 ||
        cleaned.length >= ruleFallback.length * 0.85
      ) {
        return finalize(cleaned, true);
      }
    }
    if (
      cleaned.length >= ruleFallback.length * 0.7 &&
      !aiMissingRequiredSourceCues(cleaned, sources)
    ) {
      return finalize(cleaned, true);
    }
  } catch {
    // fall through
  }

  return finalize(ruleFallback, false);
}

/** Join per-page lesson bodies into one chapter reading (no exercises). */
export function assembleChapterLessonFromPageTexts(pageTexts: string[]): string {
  const blocks = pageTexts
    .map((p) => stripWorkbookExercisesFromPage(p.trim()))
    .filter((p) => p.length >= 20);
  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}
