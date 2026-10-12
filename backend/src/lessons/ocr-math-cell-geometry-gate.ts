import type { PageCropBox } from './ocr-region-image-prep';
import {
  DIVIDE_EXERCISE_GRID_COLUMNS,
  DIVIDE_EXERCISE_GRID_ROWS,
  exerciseCellGridPosition,
  storyContamination,
  type ExerciseCellLabel,
} from './ocr-exercise-grid-cells';
import type { CellGeometryReport, GeometryStatus } from './ocr-math-cell-geometry';

export type CellMappingGateRow = {
  cell: ExerciseCellLabel;
  expectedLabel: ExerciseCellLabel;
  observedContent: string;
  correctMapping: boolean;
  clippedSymbols: boolean;
  neighborContamination: boolean;
  status: GeometryStatus;
  reasons: string[];
};

/** Geometry-only gate (no OCR). Uses box placement vs 4×4 grid band and ink heuristics. */
export function assessCellMappingGate(input: {
  label: ExerciseCellLabel;
  box: PageCropBox;
  gridBox: PageCropBox;
  geometry: CellGeometryReport;
  storyBandY0?: number;
}): CellMappingGateRow {
  const reasons: string[] = [];
  let status: GeometryStatus = input.geometry.status;
  const { row, col } = exerciseCellGridPosition(input.label);
  const bandW = input.gridBox.x1 - input.gridBox.x0;
  const bandH = input.gridBox.y1 - input.gridBox.y0;
  const cellW = bandW / DIVIDE_EXERCISE_GRID_COLUMNS;
  const cellH = bandH / DIVIDE_EXERCISE_GRID_ROWS;

  const expectedX0 = input.gridBox.x0 + col * cellW;
  const expectedX1 = input.gridBox.x0 + (col + 1) * cellW;
  const expectedY0 = input.gridBox.y0 + row * cellH;
  const expectedY1 = input.gridBox.y0 + (row + 1) * cellH;

  const cx = (input.box.x0 + input.box.x1) / 2;
  const cy = (input.box.y0 + input.box.y1) / 2;
  const colCenter = (expectedX0 + expectedX1) / 2;
  const rowCenter = (expectedY0 + expectedY1) / 2;

  const mappingOk =
    Math.abs(cx - colCenter) <= cellW * 0.45 && Math.abs(cy - rowCenter) <= cellH * 0.45;
  if (!mappingOk) {
    reasons.push('box_center_off_expected_cell');
    status = 'FAIL';
  }

  let neighborContamination = false;
  if (input.geometry.edgeInkRatio.left > 0.45 && col > 0) {
    neighborContamination = true;
    reasons.push('left_neighbor_ink');
    status = 'FAIL';
  }
  if (input.geometry.edgeInkRatio.right > 0.45 && col < DIVIDE_EXERCISE_GRID_COLUMNS - 1) {
    neighborContamination = true;
    reasons.push('right_neighbor_ink');
    status = 'FAIL';
  }

  const clippedSymbols =
    input.geometry.edgeInkRatio.top > 0.4 ||
    input.geometry.edgeInkRatio.bottom > 0.4 ||
    input.geometry.reasons.includes('crop_too_small');
  if (clippedSymbols && status !== 'FAIL') status = 'WARN';

  if (input.storyBandY0 !== undefined && input.box.y1 > input.storyBandY0 - 8) {
    reasons.push('extends_into_story_band');
    status = 'FAIL';
  }

  if (input.geometry.status === 'FAIL') {
    status = 'FAIL';
    reasons.push(...input.geometry.reasons);
  }

  const observedContent = mappingOk
    ? `grid_slot_row_${row}_col_${col}`
    : `misaligned_center_${Math.round(cx)},${Math.round(cy)}`;

  return {
    cell: input.label,
    expectedLabel: input.label,
    observedContent,
    correctMapping: mappingOk && status !== 'FAIL',
    clippedSymbols,
    neighborContamination,
    status,
    reasons,
  };
}

export function storyContaminationInBoxHeuristic(text: string): boolean {
  return storyContamination(text);
}
