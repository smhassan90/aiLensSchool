/** Math / science pages use set notation and symbols that look like OCR junk to RTL heuristics. */

export function isMathScienceSubjectName(name?: string | null): boolean {
  const n = (name ?? '').toLowerCase();
  return /\b(?:math|mathematics|algebra|geometry|calculus|physics|chemistry|biology|science|statistics)\b/.test(
    n,
  );
}

export function looksLikeMathScienceLessonText(text: string | undefined | null): boolean {
  const value = (text ?? '').trim();
  if (!value) return false;
  if (/[∪∩∅∈⊆⊇Δ∀∃ℝℕℤ]/.test(value)) return true;
  if (
    /\b(?:Exercise\s+\d|L\.H\.S|R\.H\.S|symmetric difference|De Morgan|set-builder|Commutative Property|Idempotent Laws)\b/i.test(
      value,
    )
  ) {
    return true;
  }
  if (/\{[^{}\n]{0,80}\|[^\n]{0,80}∈/.test(value)) return true;
  const braces = (value.match(/\{[^{}]{1,100}\}/g) ?? []).length;
  const setWords = (value.match(/\b(?:union|intersection|subset|disjoint|exhaustive)\b/gi) ?? []).length;
  if (braces >= 2 && setWords >= 2) return true;
  return false;
}
