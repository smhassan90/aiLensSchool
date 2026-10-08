import { parseModelJson, extractBalancedJsonObject } from '../ai/parse-model-json';
import { LessonOutput, LessonOutputSchema } from '../ai/schemas/lesson-output.schema';
import { joinCompiledChapter } from '../ai/schemas/chapter-compile.schema';

function looksLikeLessonJsonBlob(text: string): boolean {
  const t = text.trim();
  if (!t.includes('{')) return false;
  return (
    (t.includes('"summary"') || t.includes('"lessonBody"')) &&
    (t.includes('"concepts"') ||
      t.includes('"topicName"') ||
      t.includes('"chapterName"') ||
      t.includes('"exercises"'))
  );
}

function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return (fenced?.[1] ?? trimmed).trim();
}

function readableFromParsed(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;

  const lessonBody = typeof obj.lessonBody === 'string' ? obj.lessonBody.trim() : '';
  const exercises = typeof obj.exercises === 'string' ? obj.exercises.trim() : '';
  if (lessonBody || exercises) {
    return joinCompiledChapter(lessonBody, exercises);
  }

  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  if (summary) return summary;

  const parsed = LessonOutputSchema.safeParse(value);
  if (parsed.success && parsed.data.summary?.trim()) {
    return parsed.data.summary.trim();
  }
  return null;
}

function tryUnwrapJsonBlob(blob: string): string | null {
  try {
    return readableFromParsed(parseModelJson(blob));
  } catch {
    try {
      return readableFromParsed(JSON.parse(blob));
    } catch {
      return null;
    }
  }
}

/**
 * If OCR/AI stored a full lesson/compile JSON object (or prose + trailing JSON),
 * return only the human-readable lesson text — never the raw JSON.
 */
export function coerceLessonDisplayText(text: string): string {
  const original = text ?? '';
  let trimmed = stripMarkdownFence(original);
  if (!trimmed) return original;

  if (looksLikeLessonJsonBlob(trimmed) && trimmed.trimStart().startsWith('{')) {
    const unwrapped = tryUnwrapJsonBlob(trimmed);
    if (unwrapped) return unwrapped;
  }

  // Fenced JSON after prose — strip from the fence onward (keep OCR/draft only).
  const fenceStart = trimmed.search(/```(?:json)?/i);
  if (fenceStart > 0) {
    const before = trimmed.slice(0, fenceStart).trim();
    if (before && !looksLikeLessonJsonBlob(before)) {
      return before;
    }
    const afterFence = trimmed
      .slice(fenceStart)
      .replace(/^```(?:json)?/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const unwrapped = tryUnwrapJsonBlob(afterFence);
    if (unwrapped) return unwrapped;
  }

  // Prose followed by a raw JSON object (no markdown fence).
  if (looksLikeLessonJsonBlob(trimmed) && !trimmed.trimStart().startsWith('{')) {
    try {
      const jsonPart = extractBalancedJsonObject(trimmed);
      const jsonStart = trimmed.indexOf(jsonPart);
      const before = jsonStart > 0 ? trimmed.slice(0, jsonStart).trim() : '';
      if (before && !looksLikeLessonJsonBlob(before) && !before.includes('```')) {
        return before;
      }
      const unwrapped = tryUnwrapJsonBlob(jsonPart);
      if (unwrapped) return unwrapped;
    } catch {
      // keep original
    }
  }

  return original;
}

export function tryParseLessonJsonBlob(text: string): LessonOutput | null {
  const trimmed = stripMarkdownFence(text ?? '');
  if (!looksLikeLessonJsonBlob(trimmed)) return null;
  try {
    const parsed = LessonOutputSchema.safeParse(parseModelJson(trimmed));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
