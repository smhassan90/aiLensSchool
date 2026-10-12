import type { PageCropBox } from './ocr-region-image-prep';
import { cropPageRegion } from './ocr-region-image-prep';
import { imageDimensionsFromBuffer } from './ocr-image-dimensions';
import {
  DIVIDE_GRID_CALIBRATION_BOX,
  fractionBoxFromNormalized,
  hasDivideExerciseGridHeading,
  preciseDivideExerciseGridCrop,
} from './ocr-exercise-grid-crop';
import type { OcrStructuredLine } from './ocr-structured-line';
import { EXERCISE_CELL_LABELS, type ExerciseCellLabel } from './ocr-exercise-grid-cells';
import {
  cellsFromEqualGrid,
  cellsFromGridStructure,
  detectGridLinesInBand,
  type GridLineDetection,
} from './ocr-math-cell-grid-detect';
import {
  cellsFromFixtureCalibrationDoc,
  gridBoxFromFixtureDoc,
  loadFixtureCellCalibration,
} from './ocr-math-cell-fixture-calibration';
import { DIVIDE_EXERCISE_GRID_COLUMNS, DIVIDE_EXERCISE_GRID_ROWS } from './ocr-exercise-grid-cells';
import {
  inkGuidedCellsToRegions,
  mathCellInkGuidedEnabled,
  refineDivideCellsWithInkGuidance,
} from './ocr-math-cell-ink-guided';

export type MathCellRegion = {
  label: ExerciseCellLabel;
  box: PageCropBox;
  detection:
    | 'geometric_grid'
    | 'line_anchored'
    | 'fixture_calibration'
    | 'ocr_line_anchor'
    | 'ink_guided';
  confidence: number;
  uncertain: boolean;
};

export type DivideGridLayoutDetection = {
  gridBox: PageCropBox;
  cells: MathCellRegion[];
  pageWidth: number;
  pageHeight: number;
  gridLines?: GridLineDetection;
  skippedReason?: string;
};

function insetBox(box: PageCropBox, padPx: number): PageCropBox {
  return {
    x0: box.x0 + padPx,
    y0: box.y0 + padPx,
    x1: box.x1 - padPx,
    y1: box.y1 - padPx,
  };
}

/** Equal column×row split — fallback when line detection is uncertain. */
export function geometricDivideGridCells(
  gridBox: PageCropBox,
  options?: { columns?: number; rows?: number; insetPx?: number },
): MathCellRegion[] {
  const cols = options?.columns ?? DIVIDE_EXERCISE_GRID_COLUMNS;
  const rows = options?.rows ?? DIVIDE_EXERCISE_GRID_ROWS;
  const inset = options?.insetPx ?? 3;
  const inner = insetBox(gridBox, inset);
  const w = inner.x1 - inner.x0;
  const h = inner.y1 - inner.y0;
  if (w < 40 || h < 40) return [];

  const cellW = w / cols;
  const cellH = h / rows;
  const cells: MathCellRegion[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx >= EXERCISE_CELL_LABELS.length) break;
      const label = EXERCISE_CELL_LABELS[idx];
      const x0 = inner.x0 + c * cellW;
      const y0 = inner.y0 + r * cellH;
      cells.push({
        label,
        box: { x0, y0, x1: x0 + cellW, y1: y0 + cellH },
        detection: 'geometric_grid',
        confidence: 0.35,
        uncertain: true,
      });
    }
  }
  return cells;
}

export async function detectDivideExerciseGridLayout(input: {
  imageBuffer: Buffer;
  pageWidth?: number;
  pageHeight?: number;
  transcript?: string | null;
  paddleLines?: OcrStructuredLine[];
  tesseractLines?: OcrStructuredLine[];
  calibrationBox?: readonly [number, number, number, number];
  testCaseId?: string;
}): Promise<DivideGridLayoutDetection | null> {
  let pageW = input.pageWidth ?? 0;
  let pageH = input.pageHeight ?? 0;
  if (pageW <= 0 || pageH <= 0) {
    const dims = await imageDimensionsFromBuffer(input.imageBuffer);
    pageW = dims.width;
    pageH = dims.height;
  }

  const combined = [...(input.paddleLines ?? []), ...(input.tesseractLines ?? [])];
  if (!hasDivideExerciseGridHeading(combined, input.transcript)) {
    return null;
  }

  let gridBox = preciseDivideExerciseGridCrop({
    pageWidth: pageW,
    pageHeight: pageH,
    paddleLines: input.paddleLines,
    tesseractLines: input.tesseractLines,
    transcript: input.transcript,
    calibrationBox: input.calibrationBox ?? DIVIDE_GRID_CALIBRATION_BOX,
  });

  if (!gridBox) {
    gridBox = fractionBoxFromNormalized(
      input.calibrationBox ?? DIVIDE_GRID_CALIBRATION_BOX,
      pageW,
      pageH,
    );
  }

  const fixtureDoc =
    input.testCaseId
      ? loadFixtureCellCalibration(input.testCaseId, input.imageBuffer, pageW, pageH)
      : null;
  if (fixtureDoc) {
    const fixtureGrid = gridBoxFromFixtureDoc(fixtureDoc, pageW, pageH);
    if (fixtureGrid) gridBox = fixtureGrid;
    let cells = cellsFromFixtureCalibrationDoc(fixtureDoc, pageW, pageH);
    if (mathCellInkGuidedEnabled()) {
      const refined = await refineDivideCellsWithInkGuidance({
        imageBuffer: input.imageBuffer,
        pageWidth: pageW,
        pageHeight: pageH,
        gridBox,
        nominalCells: cells,
      });
      const inkCells = inkGuidedCellsToRegions(refined, true);
      if (inkCells.length >= 4) {
        cells = inkCells;
      }
    }
    return { gridBox, cells, pageWidth: pageW, pageHeight: pageH };
  }

  let gridBandBuffer: Buffer;
  try {
    gridBandBuffer = await cropPageRegion(input.imageBuffer, gridBox, 'original');
  } catch {
    return {
      gridBox,
      cells: geometricDivideGridCells(gridBox),
      pageWidth: pageW,
      pageHeight: pageH,
      skippedReason: 'grid_band_crop_failed',
    };
  }

  const gridLines = await detectGridLinesInBand(gridBandBuffer, gridBox);
  const gridOpts = { columns: DIVIDE_EXERCISE_GRID_COLUMNS, rows: DIVIDE_EXERCISE_GRID_ROWS };
  let cells = cellsFromGridStructure(gridBox, gridLines, gridOpts);

  if (gridLines.confidence < 0.45 || cells.length < 14) {
    cells = cellsFromEqualGrid(gridBox, {
      ...gridOpts,
      padPx: 10,
      confidence: gridLines.confidence,
    });
  }

  if (cells.length < 4) {
    return { gridBox, cells, pageWidth: pageW, pageHeight: pageH, gridLines, skippedReason: 'too_few_cells' };
  }
  return { gridBox, cells, pageWidth: pageW, pageHeight: pageH, gridLines };
}
