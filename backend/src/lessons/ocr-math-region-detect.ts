import type { OcrStructuredLine } from './ocr-structured-line';

export type MathRegionKind =
  | 'digit_soup'
  | 'stacked_fraction_band'
  | 'solution_block'
  | 'exercise_grid_band'
  | 'low_confidence_line';

export type MathRegion = {
  id: string;
  kind: MathRegionKind;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  pageWidth: number;
  pageHeight: number;
  sourceLineTexts: string[];
  anchorText?: string;
  uncertainReason: string;
  priority: number;
};

const DIGIT_SOUP = /\d{6,}/;
const MOSTLY_DIGITS = /^[\d\s÷×+\-=./:()'|]+$/;

function lineUncertainty(line: OcrStructuredLine): { score: number; reason: string } {
  const t = line.text.trim();
  if (!t) return { score: 0, reason: '' };
  let score = 0;
  let reason = '';
  if (DIGIT_SOUP.test(t.replace(/\s/g, ''))) {
    score += 12;
    reason = 'digit_soup';
  } else if (t.replace(/\D/g, '').length >= 5 && MOSTLY_DIGITS.test(t)) {
    score += 8;
    reason = 'digit_run';
  }
  if ((line.confidence ?? 1) < 0.52) {
    score += 6;
    reason = reason || 'low_confidence';
  }
  if (/^[\d]{3,}$/.test(t.replace(/\s/g, '')) && t.length < 20) {
    score += 5;
    reason = reason || 'compact_digits';
  }
  if (/\bSolution\b/i.test(t)) {
    score += 2;
    reason = reason || 'solution_header';
  }
  return { score, reason };
}

function expandBox(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  pageW: number,
  pageH: number,
  padFrac = 0.04,
): { x0: number; y0: number; x1: number; y1: number } {
  const padX = (x1 - x0) * padFrac + 8;
  const padY = (y1 - y0) * padFrac + 8;
  return {
    x0: Math.max(0, x0 - padX),
    y0: Math.max(0, y0 - padY),
    x1: Math.min(pageW, x1 + padX),
    y1: Math.min(pageH, y1 + padY),
  };
}

function clusterUncertainLines(
  lines: OcrStructuredLine[],
  pageW: number,
  pageH: number,
): MathRegion[] {
  const tagged = lines
    .map((line, idx) => ({ line, idx, ...lineUncertainty(line) }))
    .filter((x) => x.score >= 5);

  const regions: MathRegion[] = [];
  const used = new Set<number>();

  for (const seed of tagged.sort((a, b) => b.score - a.score)) {
    if (used.has(seed.idx)) continue;
    const cluster: OcrStructuredLine[] = [seed.line];
    used.add(seed.idx);
    const cy = (seed.line.y0 + seed.line.y1) / 2;
    for (const other of tagged) {
      if (used.has(other.idx)) continue;
      const ocy = (other.line.y0 + other.line.y1) / 2;
      const vDist = Math.abs(ocy - cy);
      const hOverlap =
        Math.min(seed.line.x1, other.line.x1) - Math.max(seed.line.x0, other.line.x0);
      if (vDist <= 72 && hOverlap > -40) {
        cluster.push(other.line);
        used.add(other.idx);
      }
    }
    let x0 = Math.min(...cluster.map((l) => l.x0));
    let y0 = Math.min(...cluster.map((l) => l.y0));
    let x1 = Math.max(...cluster.map((l) => l.x1));
    let y1 = Math.max(...cluster.map((l) => l.y1));
    const box = expandBox(x0, y0, x1, y1, pageW, pageH);
    const kind: MathRegionKind =
      cluster.length >= 3 && cluster.every((l) => MOSTLY_DIGITS.test(l.text.trim()))
        ? 'stacked_fraction_band'
        : seed.reason === 'digit_soup'
          ? 'digit_soup'
          : 'low_confidence_line';
    regions.push({
      id: `r${regions.length + 1}`,
      kind,
      ...box,
      pageWidth: pageW,
      pageHeight: pageH,
      sourceLineTexts: cluster.map((l) => l.text.trim()).filter(Boolean),
      uncertainReason: seed.reason,
      priority: seed.score + cluster.length,
    });
  }
  return regions;
}

/** Spatial exercise band below a “divide … fractions” heading (no answer hardcoding). */
function exerciseGridBandRegion(
  lines: OcrStructuredLine[],
  pageW: number,
  pageH: number,
): MathRegion | null {
  const anchor = lines.find((l) =>
    /\bdivide\b[\s\S]{0,40}\bfractions?\b/i.test(l.text),
  );
  if (!anchor) return null;
  const y0 = Math.max(0, anchor.y1 - 4);
  const y1 = Math.min(pageH, anchor.y1 + pageH * 0.28);
  if (y1 - y0 < 60) return null;
  const inBand = lines.filter(
    (l) => l.y0 >= y0 - 8 && l.y1 <= y1 + 8 && l.x1 < pageW * 0.72,
  );
  return {
    id: 'exercise_band',
    kind: 'exercise_grid_band',
    x0: 0,
    y0,
    x1: pageW * 0.72,
    y1,
    pageWidth: pageW,
    pageHeight: pageH,
    sourceLineTexts: inBand.map((l) => l.text.trim()).filter(Boolean),
    anchorText: anchor.text.trim(),
    uncertainReason: 'divide_exercise_band',
    priority: 20,
  };
}

function solutionBlockRegion(
  lines: OcrStructuredLine[],
  pageW: number,
  pageH: number,
): MathRegion | null {
  const sol = lines.find((l) => /^Solution\s*:/i.test(l.text.trim()));
  if (!sol) return null;
  const y0 = sol.y0;
  const y1 = Math.min(pageH, sol.y1 + pageH * 0.22);
  const block = lines.filter((l) => l.y0 >= y0 - 4 && l.y1 <= y1 + 4 && l.x0 < pageW * 0.65);
  const uncertain = block.some((l) => lineUncertainty(l).score >= 5);
  if (!uncertain) return null;
  const x0 = Math.min(...block.map((l) => l.x0));
  const x1 = Math.max(...block.map((l) => l.x1));
  const box = expandBox(x0, y0, x1, y1, pageW, pageH, 0.06);
  return {
    id: 'solution_block',
    kind: 'solution_block',
    ...box,
    pageWidth: pageW,
    pageHeight: pageH,
    sourceLineTexts: block.map((l) => l.text.trim()).filter(Boolean),
    anchorText: sol.text.trim(),
    uncertainReason: 'worked_solution',
    priority: 18,
  };
}

/**
 * Identify image regions that need bounded OCR retries (spatial + OCR quality).
 */
export function detectUncertainMathRegions(input: {
  paddleLines?: OcrStructuredLine[];
  tesseractLines?: OcrStructuredLine[];
  imageWidth: number;
  imageHeight: number;
}): MathRegion[] {
  const pageW = Math.max(1, input.imageWidth);
  const pageH = Math.max(1, input.imageHeight);
  const combined: OcrStructuredLine[] = [
    ...(input.paddleLines ?? []),
    ...(input.tesseractLines ?? []),
  ].filter((l) => l.text.trim());

  if (!combined.length) return [];

  const regions: MathRegion[] = [];
  const grid = exerciseGridBandRegion(combined, pageW, pageH);
  if (grid) regions.push(grid);
  const sol = solutionBlockRegion(combined, pageW, pageH);
  if (sol) regions.push(sol);
  regions.push(...clusterUncertainLines(combined, pageW, pageH));

  const deduped: MathRegion[] = [];
  for (const r of regions.sort((a, b) => b.priority - a.priority)) {
    const overlaps = deduped.some(
      (d) =>
        Math.abs(d.y0 - r.y0) < 40 &&
        Math.abs(d.y1 - r.y1) < 40 &&
        Math.abs(d.x0 - r.x0) < 60,
    );
    if (!overlaps) deduped.push(r);
  }
  return deduped;
}
