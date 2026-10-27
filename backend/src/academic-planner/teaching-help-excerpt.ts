/**
 * Build a bounded excerpt from chapter text around planner portion content anchors.
 */
export function excerptAroundAnchors(
  fullText: string,
  anchors: string[],
  maxChars = 6000,
): string {
  const text = fullText.trim();
  if (!text) return '';
  if (text.length <= maxChars) return text;

  const cleanedAnchors = anchors.map((a) => a.trim()).filter((a) => a.length >= 8);
  let bestIndex = -1;
  for (const anchor of cleanedAnchors) {
    const idx = text.indexOf(anchor);
    if (idx >= 0 && (bestIndex < 0 || idx < bestIndex)) {
      bestIndex = idx;
    }
  }

  if (bestIndex < 0) {
    return text.slice(0, maxChars);
  }

  const half = Math.floor(maxChars / 2);
  const start = Math.max(0, bestIndex - half);
  const end = Math.min(text.length, start + maxChars);
  return text.slice(start, end).trim();
}
