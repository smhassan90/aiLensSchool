/** If the API stored a full lesson JSON blob, show only the summary field. */
export function coerceLessonDisplayText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.includes('"summary"')) {
    return text;
  }
  try {
    const parsed = JSON.parse(trimmed) as { summary?: string };
    if (parsed.summary?.trim()) return parsed.summary.trim();
  } catch {
    // ignore
  }
  return text;
}
