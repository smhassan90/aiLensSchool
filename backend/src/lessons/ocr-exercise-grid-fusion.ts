import { readEnv } from '../common/env';
import {
  preciseDivideExerciseGridCrop,
  hasDivideExerciseGridHeading,
  linesInsideGridBox,
} from './ocr-exercise-grid-crop';
import {
  type ExerciseCellLabel,
  type ExerciseCellReading,
  EXERCISE_CELL_LABELS,
  parseCellsFromGridPlain,
  pickBestCellCandidate,
  cellTextFromStructuredLines,
  storyContamination,
  formatExerciseGridBlock,
  labelOrderValid,
  duplicateLabels,
  scoreCellExpression,
  normalizeCellBody,
} from './ocr-exercise-grid-cells';
import { cropPageRegion } from './ocr-region-image-prep';
import { pix2textPlainForFusion } from './ocr-pix2text-latex-plain';
import { runPix2TextOnCrops, type Pix2TextBatchResult } from './pix2text-math.runner';
import type { OcrStructuredLine } from './ocr-structured-line';
import { cleanMergedPageOcrText } from './science-ocr-clean';
import type { MathRegion } from './ocr-math-region-detect';

function pix2textMathPortionUnsafe(plain: string): boolean {
  const mathPart = (plain.split(/\breal[-\s]?life\b/i)[0] ?? plain).trim();
  return Boolean(mathPart && storyContamination(mathPart));
}

export type ExerciseGridFusionResult = {
  text: string;
  applied: boolean;
  cells: ExerciseCellReading[];
  uncertainLabels: ExerciseCellLabel[];
  skippedReason?: string;
  gridCrop?: { x0: number; y0: number; x1: number; y1: number };
  debug?: {
    baselineCellScore: number;
    fusedCellScore: number;
    pix2textGridParseLabels: ExerciseCellLabel[];
  };
};

function maxCellsPix2Text(): number {
  const n = Number(readEnv('OCR_EXERCISE_GRID_MAX_CELLS') ?? 10);
  return Math.min(14, Math.max(2, Number.isFinite(n) ? n : 10));
}

function headingLineFromTranscript(text: string): string | null {
  const line = text.split(/\r?\n/).find((l) => /\bdivide\b.*\bfractions?\b/i.test(l));
  return line?.trim() || null;
}

function baselineCellsFromMerge(
  baseTranscript: string,
  labels: ExerciseCellLabel[],
): Partial<Record<ExerciseCellLabel, string>> {
  const out: Partial<Record<ExerciseCellLabel, string>> = {};
  const blob = baseTranscript.split(/\bReal-life/i)[0] ?? baseTranscript;
  for (const label of labels) {
    const re = new RegExp(
      `\\b${label}\\s*\\.\\s*([^\\n]*?)(?=\\s*\\b[a-n]\\s*\\.|$)`,
      'is',
    );
    const m = blob.match(re);
    if (m?.[1]?.trim()) out[label] = m[1].trim();
  }
  return out;
}

function cellCropForLabel(
  label: ExerciseCellLabel,
  gridBox: { x0: number; y0: number; x1: number; y1: number },
  lines: OcrStructuredLine[],
  pageH: number,
): { x0: number; y0: number; x1: number; y1: number } | null {
  const inGrid = lines
    .filter((l) => {
      const cy = (l.y0 + l.y1) / 2;
      return cy >= gridBox.y0 && cy <= gridBox.y1;
    })
    .sort((a, b) => a.y0 - b.y0);

  const idx = inGrid.findIndex((l) => new RegExp(`\\b${label}\\s*\\.`, 'i').test(l.text));
  if (idx < 0) return null;

  const y0 = Math.max(gridBox.y0, inGrid[idx].y0 - 4);
  let y1 = gridBox.y1;
  const labelIdx = EXERCISE_CELL_LABELS.indexOf(label);
  for (let j = idx + 1; j < inGrid.length; j++) {
    for (let k = labelIdx + 1; k < EXERCISE_CELL_LABELS.length; k++) {
      const next = EXERCISE_CELL_LABELS[k];
      if (new RegExp(`\\b${next}\\s*\\.`, 'i').test(inGrid[j].text)) {
        y1 = inGrid[j].y0 - 2;
        break;
      }
    }
    if (y1 < gridBox.y1) break;
  }
  if (y1 - y0 < 12) {
    y1 = Math.min(gridBox.y1, y0 + Math.max(24, (gridBox.y1 - gridBox.y0) / 5));
  }
  return { x0: gridBox.x0, y0, x1: gridBox.x1, y1: Math.min(pageH, y1) };
}

function validateFusedGrid(
  heading: string,
  cells: ExerciseCellReading[],
  baselineScore: number,
  fusedScore: number,
): string | null {
  const block = formatExerciseGridBlock(heading, cells);
  if (storyContamination(block)) return 'story_in_grid';
  const labels = cells.map((c) => c.label);
  if (duplicateLabels(labels)) return 'duplicate_labels';
  if (!labelOrderValid(labels)) return 'label_order';
  if (cells.length < 2) return 'too_few_cells';
  const bodies = cells.map((c) => normalizeCellBody(c.text));
  const withDigits = bodies.filter((b) => /\d/.test(b)).length;
  if (withDigits < Math.max(1, Math.floor(cells.length * 0.5))) return 'missing_digits';
  const minGain = Math.max(2, Math.floor(cells.length * 0.5));
  if (fusedScore < baselineScore + minGain) return 'no_cell_improvement';
  return null;
}

function spliceExerciseGridBlock(baseText: string, heading: string, gridBlock: string): string {
  const lines = baseText.split(/\r?\n/);
  const anchor = lines.findIndex((l) => /\bdivide\b.*\bfractions?\b/i.test(l));
  if (anchor < 0) return baseText;

  let end = anchor + 1;
  while (end < lines.length && !/Real-life|Story Sums/i.test(lines[end])) {
    if (end > anchor + 22) break;
    end += 1;
  }
  const next = [...lines];
  next.splice(anchor, end - anchor, ...gridBlock.split(/\r?\n/));
  return next.join('\n');
}

/**
 * Tight grid crop → per-cell candidates (Paddle/Tess/Pix2Text) → guarded splice.
 */
export async function applyExerciseGridCellFusion(input: {
  imageBuffer: Buffer;
  imageWidth: number;
  imageHeight: number;
  baseTranscript: string;
  paddleLines?: OcrStructuredLine[];
  tesseractLines?: OcrStructuredLine[];
  runWorker?: typeof runPix2TextOnCrops;
}): Promise<ExerciseGridFusionResult> {
  const base = (input.baseTranscript ?? '').trim();
  const empty: ExerciseGridFusionResult = {
    text: base,
    applied: false,
    cells: [],
    uncertainLabels: [],
  };

  const combined = [...(input.paddleLines ?? []), ...(input.tesseractLines ?? [])];
  if (!hasDivideExerciseGridHeading(combined, base)) {
    return { ...empty, skippedReason: 'no_divide_heading' };
  }

  const gridBox = preciseDivideExerciseGridCrop({
    pageWidth: input.imageWidth,
    pageHeight: input.imageHeight,
    paddleLines: input.paddleLines,
    tesseractLines: input.tesseractLines,
    transcript: base,
  });
  if (!gridBox) {
    return { ...empty, skippedReason: 'no_grid_crop' };
  }

  const heading = headingLineFromTranscript(base) || '7. Divide the following fractions';
  const worker = input.runWorker ?? runPix2TextOnCrops;

  let gridPixPlain = '';
  try {
    const gridBuf = await cropPageRegion(input.imageBuffer, gridBox, 'original');
    const batch: Pix2TextBatchResult = await worker([{ id: 'divide_grid', buffer: gridBuf }]);
    const row = batch.results?.find((r) => r.id === 'divide_grid');
    if (row?.ok && row.text) {
      gridPixPlain = pix2textPlainForFusion(row.text);
    }
  } catch {
    // continue with engine-only cells
  }

  let skipPix2textCandidates = Boolean(gridPixPlain && pix2textMathPortionUnsafe(gridPixPlain));
  const parsedGrid = skipPix2textCandidates ? {} : parseCellsFromGridPlain(gridPixPlain);
  const parsedLabels = EXERCISE_CELL_LABELS.filter((l) => parsedGrid[l]);

  const paddleInGrid = linesInsideGridBox(input.paddleLines ?? [], gridBox);
  const tessInGrid = linesInsideGridBox(input.tesseractLines ?? [], gridBox);

  const labelSet = new Set<ExerciseCellLabel>(parsedLabels);
  for (const l of EXERCISE_CELL_LABELS) {
    if (cellTextFromStructuredLines(l, paddleInGrid, gridBox)) labelSet.add(l);
    if (cellTextFromStructuredLines(l, tessInGrid, gridBox)) labelSet.add(l);
  }

  const labels = EXERCISE_CELL_LABELS.filter((l) => labelSet.has(l)).slice(0, maxCellsPix2Text());
  if (labels.length < 2) {
    return {
      ...empty,
      skippedReason: 'insufficient_visible_labels',
      gridCrop: gridBox,
      debug: { baselineCellScore: 0, fusedCellScore: 0, pix2textGridParseLabels: parsedLabels },
    };
  }

  const cellCrops: Array<{ id: string; label: ExerciseCellLabel; buffer: Buffer }> = [];
  for (const label of labels) {
    const box = cellCropForLabel(label, gridBox, paddleInGrid, input.imageHeight);
    if (!box) continue;
    try {
      const buffer = await cropPageRegion(input.imageBuffer, box, 'original');
      cellCrops.push({ id: `cell_${label}`, label, buffer });
    } catch {
      // skip
    }
  }

  const cellPix: Partial<Record<ExerciseCellLabel, string>> = {};
  if (cellCrops.length) {
    const batch = await worker(cellCrops.map((c) => ({ id: c.id, buffer: c.buffer })));
    for (const c of cellCrops) {
      const row = batch.results?.find((r) => r.id === c.id);
      if (row?.ok && row.text) {
        const plain = pix2textPlainForFusion(row.text);
        if (pix2textMathPortionUnsafe(plain)) {
          skipPix2textCandidates = true;
          continue;
        }
        const fromParse = parseCellsFromGridPlain(plain)[c.label];
        if (fromParse) {
          cellPix[c.label] = fromParse;
        } else {
          const trimmed = (plain.split(/\breal[-\s]?life\b/i)[0] ?? plain).trim();
          if (trimmed && !storyContamination(trimmed)) {
            cellPix[c.label] = trimmed;
          }
        }
      }
    }
  }

  const baselineMap = baselineCellsFromMerge(base, labels);
  let baselineScore = 0;
  for (const label of labels) {
    const t = baselineMap[label] ? `${label}. ${baselineMap[label]}` : '';
    baselineScore += scoreCellExpression(t);
  }

  const cells: ExerciseCellReading[] = [];
  const uncertainLabels: ExerciseCellLabel[] = [];

  for (const label of labels) {
    const candidates = [
      { source: 'paddle' as const, text: cellTextFromStructuredLines(label, paddleInGrid, gridBox) },
      { source: 'tesseract' as const, text: cellTextFromStructuredLines(label, tessInGrid, gridBox) },
      {
        source: 'pix2text_grid_parse' as const,
        text: skipPix2textCandidates ? '' : (parsedGrid[label] ?? ''),
      },
      { source: 'pix2text' as const, text: skipPix2textCandidates ? '' : (cellPix[label] ?? '') },
    ].filter((c) => c.text.trim() && !storyContamination(c.text));

    const picked = pickBestCellCandidate(label, candidates);
    if (!picked) continue;
    if (picked.uncertain) uncertainLabels.push(label);
    cells.push(picked);
  }

  let fusedScore = 0;
  for (const c of cells) fusedScore += c.score;

  const fail = validateFusedGrid(heading, cells, baselineScore, fusedScore);
  if (fail) {
    return {
      ...empty,
      skippedReason: fail,
      cells,
      uncertainLabels,
      gridCrop: gridBox,
      debug: {
        baselineCellScore: baselineScore,
        fusedCellScore: fusedScore,
        pix2textGridParseLabels: parsedLabels,
      },
    };
  }

  const gridBlock = formatExerciseGridBlock(heading, cells);
  const merged = cleanMergedPageOcrText(spliceExerciseGridBlock(base, heading, gridBlock));

  const storyHeading = /Real-life\s+Story\s+Sums/gi;
  const storyDup =
    (merged.match(storyHeading) ?? []).length > (base.match(storyHeading) ?? []).length;
  if (storyDup || storyContamination(gridBlock)) {
    return {
      ...empty,
      skippedReason: 'story_dup_after_splice',
      cells,
      uncertainLabels,
      gridCrop: gridBox,
    };
  }

  return {
    text: merged,
    applied: true,
    cells,
    uncertainLabels,
    gridCrop: gridBox,
    debug: {
      baselineCellScore: baselineScore,
      fusedCellScore: fusedScore,
      pix2textGridParseLabels: parsedLabels,
    },
  };
}

/** @deprecated alias */
export const applyExerciseGridFusion = applyExerciseGridCellFusion;

/** @deprecated use applyExerciseGridCellFusion — kept for region id compatibility */
export function exerciseGridRegionFromCrop(
  gridBox: { x0: number; y0: number; x1: number; y1: number },
  pageW: number,
  pageH: number,
): MathRegion {
  return {
    id: 'exercise_band',
    kind: 'exercise_grid_band',
    ...gridBox,
    pageWidth: pageW,
    pageHeight: pageH,
    sourceLineTexts: [],
    anchorText: 'Divide the following fractions',
    uncertainReason: 'divide_exercise_band',
    priority: 20,
  };
}
