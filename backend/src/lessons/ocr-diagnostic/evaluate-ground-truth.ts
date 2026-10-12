export type GroundTruthCell = {
  label: string;
  text: string;
  uncertain?: boolean;
};

export type GroundTruthDoc = {
  testCaseId: string;
  imageRef: string;
  imageSha256?: string;
  heading?: string;
  cells?: GroundTruthCell[];
  prose?: string[];
  notes?: string;
};

function normalizeMath(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/×/g, 'x')
    .replace(/÷/g, '/');
}

export function cellExpressionMatches(candidate: string, expected: string): boolean {
  const c = normalizeMath(candidate);
  const e = normalizeMath(expected);
  if (!e) return false;
  if (c.includes(e) || e.includes(c)) return true;
  const parts = e.split('/').filter(Boolean);
  return parts.every((p) => c.includes(p.replace(/\s/g, '')));
}

export function evaluateCellsAgainstGroundTruth(
  ocrText: string,
  cells: GroundTruthCell[],
): {
  exactCellHits: number;
  cellTotal: number;
  missingLabels: string[];
  wrongLabels: string[];
} {
  const missing: string[] = [];
  const wrong: string[] = [];
  let hits = 0;
  for (const cell of cells) {
    const re = new RegExp(
      `\\b${cell.label}\\s*\\.\\s*([^\\n]*?)(?=\\s*\\b[a-z]\\s*\\.|$)`,
      'is',
    );
    const m = ocrText.match(re);
    const body = m?.[1]?.trim() ?? '';
    if (!body) {
      missing.push(cell.label);
      continue;
    }
    if (cellExpressionMatches(body, cell.text)) hits += 1;
    else wrong.push(cell.label);
  }
  return {
    exactCellHits: hits,
    cellTotal: cells.length,
    missingLabels: missing,
    wrongLabels: wrong,
  };
}

/** Simple CER/WER for prose snippets (documented: lowercase, collapse whitespace). */
export function characterErrorRate(hypothesis: string, reference: string): number {
  const h = reference.length ? hypothesis : hypothesis;
  const r = reference;
  if (!r.length) return hypothesis.length ? 1 : 0;
  let errors = 0;
  const max = Math.max(h.length, r.length);
  for (let i = 0; i < max; i++) {
    if ((h[i] ?? '') !== (r[i] ?? '')) errors += 1;
  }
  return errors / r.length;
}

export function wordErrorRate(hypothesis: string, reference: string): number {
  const hw = hypothesis.toLowerCase().split(/\s+/).filter(Boolean);
  const rw = reference.toLowerCase().split(/\s+/).filter(Boolean);
  if (!rw.length) return hw.length ? 1 : 0;
  let hits = 0;
  for (const w of rw) {
    if (hw.includes(w)) hits += 1;
  }
  return 1 - hits / rw.length;
}
