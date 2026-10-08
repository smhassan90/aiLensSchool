/** If the API stored a full lesson/compile JSON blob, show only the readable text. */
export function coerceLessonDisplayText(text: string): string {
  const original = text ?? "";
  let trimmed = original.trim();
  if (!trimmed) return original;

  const fullFence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fullFence?.[1]) trimmed = fullFence[1].trim();

  const looksLikeBlob =
    (trimmed.includes('"summary"') || trimmed.includes('"lessonBody"')) &&
    (trimmed.includes('"concepts"') ||
      trimmed.includes('"chapterName"') ||
      trimmed.includes('"topicName"') ||
      trimmed.includes('"exercises"'));

  const unwrapObject = (raw: string): string | null => {
    try {
      const parsed = JSON.parse(raw) as {
        summary?: string;
        lessonBody?: string;
        exercises?: string;
      };
      const body = (parsed.lessonBody ?? "").trim();
      const exercises = (parsed.exercises ?? "").trim();
      if (body || exercises) {
        return exercises ? `${body}\n\n## Exercises\n\n${exercises}` : body;
      }
      if (parsed.summary?.trim()) return parsed.summary.trim();
    } catch {
      // ignore
    }
    return null;
  };

  if (looksLikeBlob && trimmed.startsWith("{")) {
    const unwrapped = unwrapObject(trimmed);
    if (unwrapped) return unwrapped;
  }

  // Prose + trailing ```json ... ``` — keep prose only.
  const fenceStart = trimmed.search(/```(?:json)?/i);
  if (fenceStart > 0) {
    const before = trimmed.slice(0, fenceStart).trim();
    if (before && !before.trimStart().startsWith("{")) return before;
  }

  if (looksLikeBlob && !trimmed.startsWith("{")) {
    const start = trimmed.indexOf("{");
    if (start > 0) {
      const before = trimmed.slice(0, start).trim();
      if (before && !before.includes("```")) return before;
    }
  }

  return original;
}
