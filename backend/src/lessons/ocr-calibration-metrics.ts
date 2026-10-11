/** Metrics for textbook OCR calibration (fixtures / reports only — not production merge). */

export type CalibrationFailureCategory =
  | 'digit_soup_fraction'
  | 'missing_divide'
  | 'missing_snippet'
  | 'column_bleed'
  | 'mixed_number_split'
  | 'engine_disagreement'
  | 'low_confidence'
  | 'other';

export function normalizeForMetric(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/×/g, 'x')
    .replace(/÷/g, '/')
    .trim();
}

/** Levenshtein CER on normalized strings (0 = perfect). */
export function characterErrorRate(hypothesis: string, reference: string): number {
  const a = normalizeForMetric(hypothesis);
  const b = normalizeForMetric(reference);
  if (!b.length) return a.length ? 1 : 0;
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n] / n;
}

export function snippetFoundInTranscript(snippet: string, transcript: string): boolean {
  const s = normalizeForMetric(snippet);
  const t = normalizeForMetric(transcript);
  if (!s) return true;
  if (t.includes(s)) return true;
  // Allow slash fractions without spaces: "8/11" vs "8 / 11"
  const compact = s.replace(/\s*\/\s*/g, '/');
  const compactT = t.replace(/\s*\/\s*/g, '/');
  return compactT.includes(compact);
}

export function classifySnippetFailure(
  snippet: string,
  paddle: string,
  tesseract: string,
  merged: string,
): CalibrationFailureCategory {
  const inP = snippetFoundInTranscript(snippet, paddle);
  const inT = snippetFoundInTranscript(snippet, tesseract);
  const inM = snippetFoundInTranscript(snippet, merged);
  if (inM) return 'other';
  if (/\d{3,}/.test(merged) && /\d\/\d/.test(snippet)) return 'digit_soup_fraction';
  if (snippet.includes('÷') && !merged.includes('÷') && !merged.includes('/')) return 'missing_divide';
  if (inP !== inT) return 'engine_disagreement';
  if (/\d\s+\d\/\d/.test(snippet) && !snippetFoundInTranscript(snippet, merged)) {
    return 'mixed_number_split';
  }
  return 'missing_snippet';
}

export function exactExerciseItemMatch(
  label: string,
  expected: string,
  transcript: string,
): boolean {
  const pattern = new RegExp(
    `${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.?\\s*${normalizeForMetric(expected).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    'i',
  );
  if (pattern.test(normalizeForMetric(transcript))) return true;
  return snippetFoundInTranscript(expected, transcript);
}
