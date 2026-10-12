import { readEnv } from '../common/env';
import {
  type ExerciseCellLabel,
  type ExerciseCellReading,
  formatExerciseGridBlock,
  scoreCellExpression,
  storyContamination,
  labelOrderValid,
  duplicateLabels,
  normalizeCellBody,
} from './ocr-exercise-grid-cells';
import { detectDivideExerciseGridLayout } from './ocr-math-cell-layout';
import { fuseCellOcrCandidates } from './ocr-math-cell-fusion';
import { ocrMathCellCrop, releaseMathCellTesseractWorker } from './ocr-math-cell-ocr';
import {
  mathCellPix2TextCandidatesForFusion,
  runMathCellPix2TextBatch,
} from './ocr-math-cell-pix2text';
import { pix2textMathCropsEnabled } from './pix2text-math.runner';
import { validateCellCropGeometry } from './ocr-math-cell-geometry';
import type { OcrStructuredLine } from './ocr-structured-line';
import { cleanMergedPageOcrText } from './science-ocr-clean';

export function mathCellLayoutPipelineEnabled(): boolean {
  return readEnv('OCR_MATH_CELL_LAYOUT') === '1';
}

/** Optional fixture calibration id (e.g. p57-divide-grid) for divide-grid pages. */
export function mathCellFixtureTestCaseId(): string | undefined {
  const id = readEnv('OCR_MATH_CELL_FIXTURE')?.trim();
  return id || undefined;
}

function maxCellsToOcr(): number {
  const n = Number(readEnv('OCR_MATH_CELL_MAX') ?? 14);
  return Math.min(14, Math.max(4, Number.isFinite(n) ? n : 14));
}

function targetLabels(): ExerciseCellLabel[] | null {
  const raw = readEnv('OCR_MATH_CELL_LABELS');
  if (!raw?.trim()) return null;
  const labels = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-n]$/.test(s)) as ExerciseCellLabel[];
  return labels.length ? labels : null;
}

function headingLineFromTranscript(text: string): string {
  const line = text.split(/\r?\n/).find((l) => /\bdivide\b.*\bfractions?\b/i.test(l));
  return line?.trim() || '7. Divide the following fractions';
}

function spliceExerciseGridBlock(baseText: string, gridBlock: string): string {
  const lines = baseText.split(/\r?\n/);
  const anchor = lines.findIndex((l) => /\bdivide\b.*\bfractions?\b/i.test(l));
  if (anchor < 0) return baseText;
  let end = anchor + 1;
  while (end < lines.length && !/Real-life|Story Sums/i.test(lines[end])) {
    if (end > anchor + 24) break;
    end += 1;
  }
  const next = [...lines];
  next.splice(anchor, end - anchor, ...gridBlock.split(/\r?\n/));
  return next.join('\n');
}

function baselineCellScore(baseTranscript: string, labels: ExerciseCellLabel[]): number {
  let s = 0;
  for (const label of labels) {
    const re = new RegExp(`\\b${label}\\s*\\.\\s*([^\\n]*?)(?=\\s*\\b[a-z]\\s*\\.|$)`, 'is');
    const m = baseTranscript.match(re);
    const t = m?.[1]?.trim() ? `${label}. ${m[1].trim()}` : '';
    s += scoreCellExpression(t);
  }
  return s;
}

export type MathCellPipelineResult = {
  text: string;
  applied: boolean;
  cells: ExerciseCellReading[];
  uncertainLabels: ExerciseCellLabel[];
  skippedReason?: string;
  gridCrop?: { x0: number; y0: number; x1: number; y1: number };
  timingMs?: number;
};

export async function applyMathCellLayoutPipeline(input: {
  imageBuffer: Buffer;
  imageWidth: number;
  imageHeight: number;
  baseTranscript: string;
  paddleLines?: OcrStructuredLine[];
  tesseractLines?: OcrStructuredLine[];
  subjectName?: string;
  /** Evaluation only: limit OCR to these labels */
  labelsOverride?: ExerciseCellLabel[];
  testCaseId?: string;
  /** When true, skip OCR on geometry FAIL (Experiment B). */
  geometryOnly?: boolean;
}): Promise<MathCellPipelineResult> {
  const t0 = Date.now();
  const base = (input.baseTranscript ?? '').trim();
  const empty: MathCellPipelineResult = {
    text: base,
    applied: false,
    cells: [],
    uncertainLabels: [],
  };

  if (!mathCellLayoutPipelineEnabled()) {
    return { ...empty, skippedReason: 'disabled' };
  }

  const layout = await detectDivideExerciseGridLayout({
    imageBuffer: input.imageBuffer,
    pageWidth: input.imageWidth,
    pageHeight: input.imageHeight,
    transcript: base,
    paddleLines: input.paddleLines,
    tesseractLines: input.tesseractLines,
    testCaseId: input.testCaseId ?? mathCellFixtureTestCaseId(),
  });
  if (!layout) {
    return { ...empty, skippedReason: 'no_divide_layout' };
  }

  const pageW = layout.pageWidth;
  const pageH = layout.pageHeight;

  const labelFilter = input.labelsOverride ?? targetLabels();
  let cellsToRun = layout.cells;
  if (labelFilter) {
    const set = new Set(labelFilter);
    cellsToRun = cellsToRun.filter((c) => set.has(c.label));
  }
  cellsToRun = cellsToRun.slice(0, maxCellsToOcr());
  if (cellsToRun.length < 2) {
    return { ...empty, skippedReason: 'insufficient_cells', gridCrop: layout.gridBox };
  }

  const heading = headingLineFromTranscript(base);
  const readings: ExerciseCellReading[] = [];
  const uncertainLabels: ExerciseCellLabel[] = [];

  if (input.geometryOnly) {
    return {
      ...empty,
      skippedReason: 'geometry_only_mode',
      gridCrop: layout.gridBox,
      timingMs: Date.now() - t0,
    };
  }

  const pix2CropBuffers: Array<{ label: ExerciseCellLabel; buffer: Buffer }> = [];
  const cellGeoms: Array<{
    label: ExerciseCellLabel;
    ocrBox: { x0: number; y0: number; x1: number; y1: number };
    uncertain: boolean;
  }> = [];

  try {
    for (const cell of cellsToRun) {
      const geom = await validateCellCropGeometry({
        imageBuffer: input.imageBuffer,
        pageWidth: pageW,
        pageHeight: pageH,
        label: cell.label,
        box: cell.box,
      });
      if (geom.status === 'FAIL') {
        uncertainLabels.push(cell.label);
        continue;
      }
      cellGeoms.push({
        label: cell.label,
        ocrBox: geom.paddedBox,
        uncertain: cell.uncertain ?? false,
      });
      if (pix2textMathCropsEnabled()) {
        const { cropPageRegion } = await import('./ocr-region-image-prep');
        const cropBuf = await cropPageRegion(input.imageBuffer, geom.paddedBox, 'original');
        pix2CropBuffers.push({ label: cell.label, buffer: cropBuf });
      }
    }

    const pix2Batch = pix2CropBuffers.length
      ? await runMathCellPix2TextBatch({ crops: pix2CropBuffers })
      : null;
    const pix2Rows = pix2Batch?.batches.flatMap((b) => b.rows) ?? [];

    for (const cellGeom of cellGeoms) {
      const candidates = await ocrMathCellCrop({
        imageBuffer: input.imageBuffer,
        box: cellGeom.ocrBox,
        subjectName: input.subjectName,
      });
      if (pix2Rows.length) {
        candidates.push(...mathCellPix2TextCandidatesForFusion(cellGeom.label, pix2Rows));
      }
      const fused = fuseCellOcrCandidates(cellGeom.label, candidates);
      if (!fused) continue;
      if (fused.uncertain || cellGeom.uncertain) uncertainLabels.push(cellGeom.label);
      readings.push(fused);
    }
  } finally {
    await releaseMathCellTesseractWorker();
  }

  if (readings.length < 2) {
    return {
      ...empty,
      skippedReason: 'no_cell_readings',
      gridCrop: layout.gridBox,
      timingMs: Date.now() - t0,
    };
  }

  const labels = readings.map((r) => r.label);
  if (duplicateLabels(labels) || !labelOrderValid(labels)) {
    return {
      ...empty,
      skippedReason: 'invalid_label_order',
      cells: readings,
      uncertainLabels,
      gridCrop: layout.gridBox,
      timingMs: Date.now() - t0,
    };
  }

  const baseline = baselineCellScore(base, labels);
  let fusedScore = 0;
  for (const r of readings) fusedScore += scoreCellExpression(r.text);
  const minGain = Math.max(2, Math.floor(labels.length * 0.35));
  if (fusedScore < baseline + minGain) {
    return {
      ...empty,
      skippedReason: 'no_score_improvement',
      cells: readings,
      uncertainLabels,
      gridCrop: layout.gridBox,
      timingMs: Date.now() - t0,
    };
  }

  const gridBlock = formatExerciseGridBlock(heading, readings);
  if (storyContamination(gridBlock)) {
    return {
      ...empty,
      skippedReason: 'story_contamination',
      cells: readings,
      gridCrop: layout.gridBox,
      timingMs: Date.now() - t0,
    };
  }

  const merged = cleanMergedPageOcrText(spliceExerciseGridBlock(base, gridBlock));
  return {
    text: merged,
    applied: true,
    cells: readings,
    uncertainLabels,
    gridCrop: layout.gridBox,
    timingMs: Date.now() - t0,
  };
}
