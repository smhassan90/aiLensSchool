import type { PageCropBox } from './ocr-region-image-prep';
import { EXERCISE_CELL_LABELS, type ExerciseCellLabel } from './ocr-exercise-grid-cells';
import type { MathCellRegion } from './ocr-math-cell-layout';

export type GridLineDetection = {
  horizontalYs: number[];
  verticalX: number;
  method: 'ink_profile' | 'equal_fallback';
  confidence: number;
};

async function sharpRawGrey(gridBuffer: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const sharpModule = await import('sharp');
  const sharp =
    (sharpModule as { default?: (i: Buffer) => import('sharp').Sharp }).default ??
    (sharpModule as unknown as (i: Buffer) => import('sharp').Sharp);
  const meta = await sharp(gridBuffer).metadata();
  const targetW = Math.min(800, meta.width ?? 800);
  const { data, info } = await sharp(gridBuffer)
    .greyscale()
    .resize({ width: targetW, withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Estimate horizontal grid separators and vertical column split inside a grid-band crop.
 * Coordinates are in the same space as `gridBox` (full page pixels).
 */
export async function detectGridLinesInBand(
  gridBandBuffer: Buffer,
  gridBox: PageCropBox,
): Promise<GridLineDetection> {
  const bandW = gridBox.x1 - gridBox.x0;
  const bandH = gridBox.y1 - gridBox.y0;
  if (bandW < 40 || bandH < 40) {
    return {
      horizontalYs: [],
      verticalX: gridBox.x0 + bandW / 2,
      method: 'equal_fallback',
      confidence: 0,
    };
  }

  const { data, width, height } = await sharpRawGrey(gridBandBuffer);
  const rowInk = new Float32Array(height);
  const colInk = new Float32Array(width);

  for (let y = 0; y < height; y++) {
    let dark = 0;
    for (let x = 0; x < width; x++) {
      const v = data[y * width + x];
      if (v < 145) dark += 1;
    }
    rowInk[y] = dark / width;
  }
  for (let x = 0; x < width; x++) {
    let dark = 0;
    for (let y = 0; y < height; y++) {
      const v = data[y * width + x];
      if (v < 145) dark += 1;
    }
    colInk[x] = dark / height;
  }

  const hPeaks: number[] = [];
  const threshold = 0.12;
  for (let y = 1; y < height - 1; y++) {
    if (rowInk[y] >= threshold && rowInk[y] >= rowInk[y - 1] && rowInk[y] >= rowInk[y + 1]) {
      hPeaks.push(y);
    }
  }

  const scaleY = bandH / height;
  const pageHorizontals = hPeaks.map((y) => gridBox.y0 + y * scaleY);

  let verticalX = gridBox.x0 + bandW / 2;
  let bestGap = 0;
  const midStart = Math.floor(width * 0.35);
  const midEnd = Math.floor(width * 0.65);
  for (let x = midStart; x < midEnd; x++) {
    const gap = 1 - colInk[x];
    if (gap > bestGap) {
      bestGap = gap;
      verticalX = gridBox.x0 + (x / width) * bandW;
    }
  }

  const merged = mergeClosePeaks(pageHorizontals, 14);
  const confidence =
    merged.length >= 6 && merged.length <= 10 ? 0.75 : merged.length >= 4 ? 0.45 : 0.25;

  return {
    horizontalYs: merged.sort((a, b) => a - b),
    verticalX,
    method: merged.length >= 6 && merged.length <= 10 ? 'ink_profile' : 'equal_fallback',
    confidence,
  };
}

function mergeClosePeaks(ys: number[], minGapPx: number): number[] {
  if (!ys.length) return [];
  const sorted = [...ys].sort((a, b) => a - b);
  const out: number[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - out[out.length - 1] >= minGapPx) out.push(sorted[i]);
    else out[out.length - 1] = (out[out.length - 1] + sorted[i]) / 2;
  }
  return out;
}

function equalRowBounds(gridBox: PageCropBox, rows: number): number[] {
  const step = (gridBox.y1 - gridBox.y0) / rows;
  return Array.from({ length: rows + 1 }, (_, i) => gridBox.y0 + i * step);
}

function rowBoundsFromHorizontals(
  gridBox: PageCropBox,
  horizontalYs: number[],
  rows: number,
): number[] {
  const bandH = gridBox.y1 - gridBox.y0;
  const minRowH = bandH / rows;
  const merged = mergeClosePeaks(
    horizontalYs.filter((y) => y > gridBox.y0 + 4 && y < gridBox.y1 - 4),
    Math.max(14, minRowH * 0.35),
  );

  if (merged.length < rows - 1) {
    return equalRowBounds(gridBox, rows);
  }

  if (merged.length > rows + 2) {
    return equalRowBounds(gridBox, rows);
  }

  const ys = [gridBox.y0, ...merged, gridBox.y1].sort((a, b) => a - b);
  while (ys.length < rows + 1) {
    ys.push(gridBox.y1);
  }
  if (ys.length > rows + 1) {
    return equalRowBounds(gridBox, rows);
  }
  for (let i = 1; i < ys.length; i++) {
    if (ys[i] - ys[i - 1] < minRowH * 0.45) {
      return equalRowBounds(gridBox, rows);
    }
  }
  return ys.slice(0, rows + 1);
}

/** Equal row/column splits (used when printed grid is 4×4 on divide pages). */
export function cellsFromEqualGrid(
  gridBox: PageCropBox,
  options?: { columns?: number; rows?: number; padPx?: number; confidence?: number },
): MathCellRegion[] {
  const cols = options?.columns ?? 4;
  const rows = options?.rows ?? 4;
  const pad = options?.padPx ?? 3;
  const confidence = options?.confidence ?? 0.55;
  const bandW = gridBox.x1 - gridBox.x0;
  const bandH = gridBox.y1 - gridBox.y0;
  const cellW = bandW / cols;
  const cellH = bandH / rows;
  const cells: MathCellRegion[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx >= EXERCISE_CELL_LABELS.length) break;
      const label = EXERCISE_CELL_LABELS[idx];
      const x0 = gridBox.x0 + c * cellW + pad;
      const y0 = gridBox.y0 + r * cellH + pad;
      const x1 = gridBox.x0 + (c + 1) * cellW - pad;
      const y1 = gridBox.y0 + (r + 1) * cellH - pad;
      if (y1 - y0 < 14 || x1 - x0 < 40) continue;
      cells.push({
        label,
        box: { x0, y0, x1, y1 },
        detection: 'geometric_grid',
        confidence,
        uncertain: confidence < 0.5,
      });
    }
  }
  return cells;
}

export function cellsFromGridStructure(
  gridBox: PageCropBox,
  lines: GridLineDetection,
  options?: { columns?: number; rows?: number; padPx?: number },
): MathCellRegion[] {
  const cols = options?.columns ?? 4;
  const rows = options?.rows ?? 4;
  if (cols > 2) {
    return cellsFromEqualGrid(gridBox, {
      columns: cols,
      rows,
      padPx: options?.padPx,
      confidence: lines.confidence,
    });
  }
  const pad = options?.padPx ?? 4;
  const rowBounds = rowBoundsFromHorizontals(gridBox, lines.horizontalYs, rows);
  const xSplit = lines.verticalX;
  const cells: MathCellRegion[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx >= EXERCISE_CELL_LABELS.length) break;
      const label = EXERCISE_CELL_LABELS[idx];
      const y0 = rowBounds[r] + pad;
      const y1 = rowBounds[r + 1] - pad;
      const x0 = c === 0 ? gridBox.x0 + pad : xSplit + pad;
      const x1 = c === 0 ? xSplit - pad : gridBox.x1 - pad;
      if (y1 - y0 < 14 || x1 - x0 < 40) continue;
      cells.push({
        label,
        box: { x0, y0, x1, y1 },
        detection: lines.method === 'ink_profile' ? 'line_anchored' : 'geometric_grid',
        confidence: lines.confidence,
        uncertain: lines.confidence < 0.45,
      });
    }
  }
  return cells;
}
