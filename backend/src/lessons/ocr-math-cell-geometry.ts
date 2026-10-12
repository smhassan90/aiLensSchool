import type { PageCropBox } from './ocr-region-image-prep';
import type { ExerciseCellLabel } from './ocr-exercise-grid-cells';

export type GeometryStatus = 'PASS' | 'WARN' | 'FAIL';

export type CellGeometryReport = {
  label: ExerciseCellLabel;
  status: GeometryStatus;
  reasons: string[];
  box: PageCropBox;
  paddedBox: PageCropBox;
  width: number;
  height: number;
  edgeInkRatio: { top: number; bottom: number; left: number; right: number };
};

function clampBox(box: PageCropBox, pageW: number, pageH: number): PageCropBox {
  return {
    x0: Math.max(0, Math.min(pageW - 1, box.x0)),
    y0: Math.max(0, Math.min(pageH - 1, box.y0)),
    x1: Math.max(1, Math.min(pageW, box.x1)),
    y1: Math.max(1, Math.min(pageH, box.y1)),
  };
}

export function padCellBox(box: PageCropBox, padPx: number, pageW: number, pageH: number): PageCropBox {
  return clampBox(
    {
      x0: box.x0 - padPx,
      y0: box.y0 - padPx,
      x1: box.x1 + padPx,
      y1: box.y1 + padPx,
    },
    pageW,
    pageH,
  );
}

async function edgeInkRatios(
  imageBuffer: Buffer,
  box: PageCropBox,
): Promise<{ top: number; bottom: number; left: number; right: number }> {
  const sharpModule = await import('sharp');
  const sharp =
    (sharpModule as { default?: (i: Buffer) => import('sharp').Sharp }).default ??
    (sharpModule as unknown as (i: Buffer) => import('sharp').Sharp);
  const left = Math.floor(box.x0);
  const top = Math.floor(box.y0);
  const width = Math.max(1, Math.ceil(box.x1 - box.x0));
  const height = Math.max(1, Math.ceil(box.y1 - box.y0));
  const { data } = await sharp(imageBuffer)
    .extract({ left, top, width, height })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const edge = Math.max(2, Math.min(4, Math.floor(Math.min(width, height) * 0.08)));
  const ink = (x: number, y: number) => data[y * width + x] < 140;

  const ratioBand = (xs: number[], ys: number[]) => {
    let n = 0;
    let d = 0;
    for (const y of ys) {
      for (const x of xs) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
          d += 1;
          if (ink(x, y)) n += 1;
        }
      }
    }
    return d ? n / d : 0;
  };

  const xs = Array.from({ length: width }, (_, i) => i);
  const ys = Array.from({ length: height }, (_, i) => i);
  return {
    top: ratioBand(xs, ys.slice(0, edge)),
    bottom: ratioBand(xs, ys.slice(height - edge)),
    left: ratioBand(xs.slice(0, edge), ys),
    right: ratioBand(xs.slice(width - edge), ys),
  };
}

export async function validateCellCropGeometry(input: {
  imageBuffer: Buffer;
  pageWidth: number;
  pageHeight: number;
  label: ExerciseCellLabel;
  box: PageCropBox;
  padPx?: number;
}): Promise<CellGeometryReport> {
  const pad = input.padPx ?? 6;
  const reasons: string[] = [];
  const box = clampBox(input.box, input.pageWidth, input.pageHeight);
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  let status: GeometryStatus = 'PASS';

  if (w < 48 || h < 22) {
    reasons.push('crop_too_small');
    status = 'FAIL';
  }
  if (box.x0 < 0 || box.y0 < 0 || box.x1 > input.pageWidth || box.y1 > input.pageHeight) {
    reasons.push('out_of_bounds');
    status = 'FAIL';
  }

  const paddedBox = padCellBox(box, pad, input.pageWidth, input.pageHeight);
  let edgeInkRatio = { top: 0, bottom: 0, left: 0, right: 0 };
  try {
    edgeInkRatio = await edgeInkRatios(input.imageBuffer, box);
    if (edgeInkRatio.top > 0.35 || edgeInkRatio.bottom > 0.35) {
      reasons.push('high_edge_ink_vertical');
      if (status === 'PASS') status = 'WARN';
    }
    if (edgeInkRatio.left > 0.4 || edgeInkRatio.right > 0.4) {
      reasons.push('high_edge_ink_horizontal');
      if (status === 'PASS') status = 'WARN';
    }
  } catch {
    reasons.push('edge_ink_analysis_failed');
    if (status === 'PASS') status = 'WARN';
  }

  if (w < 70 || h < 28) {
    reasons.push('marginal_dimensions');
    if (status === 'PASS') status = 'WARN';
  }

  return {
    label: input.label,
    status,
    reasons,
    box,
    paddedBox,
    width: w,
    height: h,
    edgeInkRatio,
  };
}

export function boxesOverlap(a: PageCropBox, b: PageCropBox, minIoU = 0.35): boolean {
  const x0 = Math.max(a.x0, b.x0);
  const y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1);
  const y1 = Math.min(a.y1, b.y1);
  if (x1 <= x0 || y1 <= y0) return false;
  const inter = (x1 - x0) * (y1 - y0);
  const areaA = (a.x1 - a.x0) * (a.y1 - a.y0);
  const areaB = (b.x1 - b.x0) * (b.y1 - b.y0);
  const iou = inter / Math.max(1, areaA + areaB - inter);
  return iou >= minIoU;
}
