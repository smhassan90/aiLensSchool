import { readEnv } from '../common/env';
import type { PageCropBox } from './ocr-region-image-prep';
import {
  DIVIDE_EXERCISE_GRID_COLUMNS,
  EXERCISE_CELL_LABELS,
  exerciseCellGridPosition,
  type ExerciseCellLabel,
} from './ocr-exercise-grid-cells';
import type { MathCellRegion } from './ocr-math-cell-layout';

export type InkGuidedCellStatus =
  | 'complete_isolated'
  | 'complete_with_whitespace'
  | 'neighbor_contamination_risk'
  | 'clipped_candidate'
  | 'ambiguous_rejected';

export type InkGuidedCellResult = {
  label: ExerciseCellLabel;
  nominalBox: PageCropBox;
  semanticBox: PageCropBox;
  status: InkGuidedCellStatus;
  reasons: string[];
  inkBounds: PageCropBox | null;
  diagnostics: {
    inkPixelCount: number;
    rightGutterPx: number;
    nextColumnX0: number | null;
  };
};

export function mathCellInkGuidedEnabled(): boolean {
  return readEnv('OCR_MATH_CELL_INK_GUIDED') === '1';
}

const INK_THRESHOLD = 145;
const MIN_GAP_PX = 10;
const LABEL_GUARD_PX = 6;

async function pageGreyRaw(
  imageBuffer: Buffer,
): Promise<{ data: Buffer; width: number; height: number }> {
  const sharpModule = await import('sharp');
  const sharp =
    (sharpModule as { default?: (i: Buffer) => import('sharp').Sharp }).default ??
    (sharpModule as unknown as (i: Buffer) => import('sharp').Sharp);
  const { data, info } = await sharp(imageBuffer)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function isInk(data: Buffer, width: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= width) return false;
  return data[y * width + x] < INK_THRESHOLD;
}

function inkBoundsInRect(
  data: Buffer,
  pageW: number,
  pageH: number,
  rect: PageCropBox,
): PageCropBox | null {
  const x0 = Math.max(0, Math.floor(rect.x0));
  const y0 = Math.max(0, Math.floor(rect.y0));
  const x1 = Math.min(pageW - 1, Math.ceil(rect.x1));
  const y1 = Math.min(pageH - 1, Math.ceil(rect.y1));
  let minX = x1;
  let minY = y1;
  let maxX = x0;
  let maxY = y0;
  let count = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (isInk(data, pageW, x, y)) {
        count += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (count < 8) return null;
  return { x0: minX, y0: minY, x1: maxX + 1, y1: maxY + 1 };
}

function countInkInRect(data: Buffer, pageW: number, rect: PageCropBox): number {
  const x0 = Math.floor(rect.x0);
  const y0 = Math.floor(rect.y0);
  const x1 = Math.ceil(rect.x1);
  const y1 = Math.ceil(rect.y1);
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (isInk(data, pageW, x, y)) count += 1;
    }
  }
  return count;
}

function columnNeighborRight(label: ExerciseCellLabel): ExerciseCellLabel | null {
  const { row, col } = exerciseCellGridPosition(label);
  const nextCol = col + 1;
  if (nextCol >= 4) return null;
  const idx = row * 4 + nextCol;
  return EXERCISE_CELL_LABELS[idx] ?? null;
}

function findLabelInkX(
  data: Buffer,
  pageW: number,
  rowBox: PageCropBox,
  expectedX: number,
): number | null {
  const y0 = Math.floor(rowBox.y0);
  const y1 = Math.ceil(rowBox.y1);
  const xStart = Math.max(0, Math.floor(expectedX));
  const xEnd = Math.min(pageW - 1, Math.ceil(expectedX + 26));
  let bestX: number | null = null;
  let bestHits = 0;
  for (let x = xStart; x <= xEnd; x++) {
    let hits = 0;
    for (let y = y0; y <= y1; y++) {
      if (isInk(data, pageW, x, y)) hits += 1;
    }
    if (hits >= 2 && hits >= bestHits) {
      bestHits = hits;
      bestX = x;
    }
  }
  return bestX;
}

/** Next column boundary in the row (nominal cell x0), or grid edge when the slot has no label. */
function rowColumnRightBoundary(
  label: ExerciseCellLabel,
  nominal: MathCellRegion,
  nominalCells: MathCellRegion[],
  gridBox: PageCropBox,
): number {
  const { row, col } = exerciseCellGridPosition(label);
  const byLabel = new Map(nominalCells.map((c) => [c.label, c]));
  for (let c = col + 1; c < DIVIDE_EXERCISE_GRID_COLUMNS; c++) {
    const idx = row * DIVIDE_EXERCISE_GRID_COLUMNS + c;
    const neighbor = EXERCISE_CELL_LABELS[idx];
    const cell = neighbor ? byLabel.get(neighbor) : undefined;
    if (cell) return cell.box.x0;
  }
  const colWidth = nominal.box.x1 - nominal.box.x0;
  const emptySlots = DIVIDE_EXERCISE_GRID_COLUMNS - col - 1;
  return Math.min(gridBox.x1, nominal.box.x1 + emptySlots * colWidth);
}

function horizontalInkProfile(
  data: Buffer,
  pageW: number,
  y0: number,
  y1: number,
  x0: number,
  x1: number,
): number[] {
  const profile: number[] = [];
  const ya = Math.floor(y0);
  const yb = Math.ceil(y1);
  const xa = Math.max(0, Math.floor(x0));
  const xb = Math.min(pageW - 1, Math.ceil(x1));
  for (let x = xa; x <= xb; x++) {
    let dark = 0;
    let n = 0;
    for (let y = ya; y <= yb; y++) {
      n += 1;
      if (isInk(data, pageW, x, y)) dark += 1;
    }
    profile.push(n ? dark / n : 0);
  }
  return profile;
}

function rightExtentFromProfile(
  profile: number[],
  startOffset: number,
  maxWidth: number,
  inkMin = 0.04,
): number {
  let lastInk = startOffset;
  let gap = 0;
  for (let i = startOffset; i < profile.length && i < maxWidth; i++) {
    if (profile[i] >= inkMin) {
      lastInk = i;
      gap = 0;
    } else {
      gap += 1;
      if (gap >= MIN_GAP_PX) break;
    }
  }
  return lastInk;
}

/**
 * Expand nominal fixture boxes horizontally within each row using ink profiles,
 * stopping before the next column's label ink.
 */
export async function refineDivideCellsWithInkGuidance(input: {
  imageBuffer: Buffer;
  pageWidth: number;
  pageHeight: number;
  gridBox: PageCropBox;
  nominalCells: MathCellRegion[];
}): Promise<InkGuidedCellResult[]> {
  const { data, width: pageW, height: pageH } = await pageGreyRaw(input.imageBuffer);
  const byLabel = new Map(input.nominalCells.map((c) => [c.label, c]));
  const results: InkGuidedCellResult[] = [];

  for (const label of EXERCISE_CELL_LABELS) {
    const nominal = byLabel.get(label);
    if (!nominal) continue;

    const reasons: string[] = [];
    const rightNeighbor = columnNeighborRight(label);
    const nextColCell = rightNeighbor ? byLabel.get(rightNeighbor) : null;
    const nextColumnX0 = rowColumnRightBoundary(
      label,
      nominal,
      input.nominalCells,
      input.gridBox,
    );

    const rowBox: PageCropBox = {
      x0: input.gridBox.x0,
      y0: nominal.box.y0,
      x1: input.gridBox.x1,
      y1: nominal.box.y1,
    };

    const labelX = findLabelInkX(data, pageW, rowBox, nominal.box.x0) ?? nominal.box.x0;
    const colWidth = nominal.box.x1 - nominal.box.x0;
    const spillCapX1 = nextColCell
      ? nextColCell.box.x0 - LABEL_GUARD_PX
      : Math.min(nextColumnX0 - 1, nominal.box.x1 + Math.round(colWidth * 0.28));
    const searchX1 = Math.min(spillCapX1, input.gridBox.x1);
    const profile = horizontalInkProfile(
      data,
      pageW,
      nominal.box.y0,
      nominal.box.y1,
      Math.max(input.gridBox.x0, labelX - 2),
      searchX1,
    );
    const relRight = rightExtentFromProfile(profile, 0, profile.length);
    const profileStartX = Math.max(input.gridBox.x0, labelX - 2);
    let semanticX1 = profileStartX + relRight + 4;
    semanticX1 = Math.min(semanticX1, searchX1);

    const rowInkBounds = inkBoundsInRect(data, pageW, pageH, {
      x0: Math.max(input.gridBox.x0, labelX - 2),
      y0: nominal.box.y0,
      x1: searchX1 + 1,
      y1: nominal.box.y1,
    });
    if (rowInkBounds && rowInkBounds.x1 > semanticX1) {
      semanticX1 = Math.min(rowInkBounds.x1 + 2, searchX1);
      reasons.push('ink_bounds_extended_right');
    }

    if (nextColCell) {
      const neighborLabelX = findLabelInkX(data, pageW, rowBox, nextColCell.box.x0);
      if (neighborLabelX != null && semanticX1 >= neighborLabelX - LABEL_GUARD_PX) {
        semanticX1 = neighborLabelX - LABEL_GUARD_PX;
        reasons.push('stopped_before_neighbor_label');
      }
    }

    let semanticY0 = nominal.box.y0;
    let semanticY1 = nominal.box.y1;
    const { row } = exerciseCellGridPosition(label);
    if (row === 0) {
      const ya = Math.floor(nominal.box.y0);
      const yb = Math.ceil(nominal.box.y1);
      const xa = Math.floor(nominal.box.x0);
      const xb = Math.ceil(nominal.box.x1);
      for (let y = ya; y <= yb; y++) {
        let dark = 0;
        let n = 0;
        for (let x = xa; x <= xb; x++) {
          n += 1;
          if (isInk(data, pageW, x, y)) dark += 1;
        }
        if (n && dark / n > 0.05) {
          if (y > ya + 2) {
            semanticY0 = y - 1;
            reasons.push('row0_top_ink_trim');
          }
          break;
        }
      }
    }

    semanticX1 = Math.max(nominal.box.x1, semanticX1);

    const semanticBox: PageCropBox = {
      x0: Math.max(input.gridBox.x0, Math.min(labelX - 2, nominal.box.x0)),
      y0: semanticY0,
      x1: Math.max(nominal.box.x0 + 20, semanticX1),
      y1: semanticY1,
    };

    const inkBounds = inkBoundsInRect(data, pageW, pageH, semanticBox);
    let status: InkGuidedCellStatus = 'complete_isolated';
    if (!inkBounds) {
      status = 'ambiguous_rejected';
      reasons.push('insufficient_ink');
    } else if (
      semanticBox.x1 <= nominal.box.x1 + 2 &&
      (!inkBounds || inkBounds.x1 <= nominal.box.x1 + 2)
    ) {
      status = 'clipped_candidate';
      reasons.push('no_horizontal_expansion');
    } else if (semanticBox.x1 > nominal.box.x1 + 40) {
      status = 'neighbor_contamination_risk';
      reasons.push('wide_expansion');
    } else {
      status = 'complete_with_whitespace';
    }

    if (inkBounds && inkBounds.x1 < semanticBox.x1 - 8) {
      reasons.push('trailing_whitespace');
    }

    results.push({
      label,
      nominalBox: nominal.box,
      semanticBox,
      status,
      reasons,
      inkBounds,
      diagnostics: {
        inkPixelCount: inkBounds
          ? countInkInRect(data, pageW, inkBounds)
          : 0,
        rightGutterPx: Math.round(nextColumnX0 - semanticBox.x1),
        nextColumnX0: nextColCell ? nextColCell.box.x0 : null,
      },
    });
  }

  return results;
}

export function inkGuidedCellsToRegions(
  refined: InkGuidedCellResult[],
  rejectAmbiguous = true,
): MathCellRegion[] {
  return refined
    .filter((r) => !rejectAmbiguous || r.status !== 'ambiguous_rejected')
    .map((r) => {
      const useNominal =
        r.status === 'ambiguous_rejected' ||
        r.status === 'neighbor_contamination_risk';
      return {
        label: r.label,
        box: useNominal ? r.nominalBox : r.semanticBox,
        detection: 'ink_guided' as const,
        confidence:
          r.status === 'complete_isolated' || r.status === 'complete_with_whitespace' ? 0.85 : 0.55,
        uncertain:
          useNominal ||
          r.status === 'neighbor_contamination_risk' ||
          r.status === 'clipped_candidate',
      };
    });
}
