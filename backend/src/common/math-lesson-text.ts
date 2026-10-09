/** Math / science pages use set notation and symbols that look like OCR junk to RTL heuristics. */

const MATH_SYMBOL_RE = /[∪∩∅∈⊆⊇Δ∀∃ℝℕℤλμνπωσθαβγδφψΩ°±×÷≈≠≤≥√∞]/u;
const GREEK_LETTER_RE = /[\u0370-\u03FF]/u;

export function isMathScienceSubjectName(name?: string | null): boolean {
  const n = (name ?? '').toLowerCase();
  return /\b(?:math|maths|mathematics|algebra|geometry|calculus|physics|chemistry|biology|science|statistics|numeracy|arithmetic)\b/.test(
    n,
  );
}

/** True for tokens that are math/Greek symbols (must not be treated as OCR garbage). */
export function tokenLooksLikeMathSymbol(token: string): boolean {
  const raw = token.trim();
  if (!raw) return false;
  if (MATH_SYMBOL_RE.test(raw) || GREEK_LETTER_RE.test(raw)) return true;
  // Short formula fragments: f=, λ=, v=f×λ style leftovers
  if (/^[A-Za-zλμνπω]\s*[=×*+\-/]$/u.test(raw)) return true;
  return false;
}

export function lineLooksLikeMathOrFormula(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (MATH_SYMBOL_RE.test(trimmed) || GREEK_LETTER_RE.test(trimmed)) return true;
  if (/\b(?:Hz|m\/s|wavelength|frequency|amplitude|period)\b/i.test(trimmed)) return true;
  if (/\b[A-Za-zλμν]\s*=\s*[-\d.]/u.test(trimmed)) return true;
  if (/\d+\s*(?:Hz|m\/s|m\b|s\b)/i.test(trimmed)) return true;
  if (/v\s*=\s*f\s*[×x*]\s*/i.test(trimmed)) return true;
  return false;
}

export function looksLikeMathScienceLessonText(text: string | undefined | null): boolean {
  const value = (text ?? '').trim();
  if (!value) return false;
  if (MATH_SYMBOL_RE.test(value) || GREEK_LETTER_RE.test(value)) return true;
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
  if (
    /\b(?:wavelength|frequency|amplitude|ripple\s*tank|wave\s*speed|self[- ]?assessment)\b/i.test(value) &&
    (/\d+\s*(?:Hz|m\/s|m\b|s\b)/i.test(value) || /v\s*=\s*f/i.test(value) || /step\s*\d/i.test(value))
  ) {
    return true;
  }
  return false;
}
