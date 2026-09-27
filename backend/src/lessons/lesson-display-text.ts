import { parseModelJson } from '../ai/parse-model-json';
import { LessonOutput, LessonOutputSchema } from '../ai/schemas/lesson-output.schema';

function looksLikeLessonJsonBlob(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith('{')) return false;
  return (
    t.includes('"summary"') &&
    (t.includes('"concepts"') || t.includes('"topicName"') || t.includes('"chapterName"'))
  );
}

/** If OCR/AI stored a full lesson JSON object as text, return the human-readable summary. */
export function coerceLessonDisplayText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || !looksLikeLessonJsonBlob(trimmed)) {
    return text;
  }
  try {
    const value = parseModelJson(trimmed);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const summary = (value as { summary?: unknown }).summary;
      if (typeof summary === 'string' && summary.trim()) {
        return summary.trim();
      }
      const parsed = LessonOutputSchema.safeParse(value);
      if (parsed.success && parsed.data.summary?.trim()) {
        return parsed.data.summary.trim();
      }
    }
  } catch {
    // keep original
  }
  return text;
}

export function tryParseLessonJsonBlob(text: string): LessonOutput | null {
  const trimmed = text.trim();
  if (!looksLikeLessonJsonBlob(trimmed)) return null;
  try {
    const parsed = LessonOutputSchema.safeParse(parseModelJson(trimmed));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
