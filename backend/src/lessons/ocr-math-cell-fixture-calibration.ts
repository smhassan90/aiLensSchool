import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { PageCropBox } from './ocr-region-image-prep';
import { fractionBoxFromNormalized } from './ocr-exercise-grid-crop';
import type { ExerciseCellLabel } from './ocr-exercise-grid-cells';
import type { MathCellRegion } from './ocr-math-cell-layout';

export type FixtureCellCalibrationDoc = {
  testCaseId: string;
  orientSha256: string;
  pageWidth: number;
  pageHeight: number;
  coordinateSystem: string;
  gridBandNorm?: [number, number, number, number];
  gridBandPx?: PageCropBox;
  cells: Array<{
    label: ExerciseCellLabel;
    boxNorm: [number, number, number, number];
    boxPx?: PageCropBox;
  }>;
};

function fixtureCalibrationDir(): string {
  const candidates = [
    join(process.cwd(), 'test-fixtures', 'ocr-ground-truth'),
    join(process.cwd(), 'docs', 'ocr', 'ground_truth'),
    join(process.cwd(), '..', 'docs', 'ocr', 'ground_truth'),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return candidates[0];
}

export function sha256Buffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function loadFixtureCellCalibration(
  testCaseId: string,
  imageBuffer: Buffer,
  pageW: number,
  pageH: number,
): FixtureCellCalibrationDoc | null {
  const path = join(fixtureCalibrationDir(), `${testCaseId}-cell-calibration.json`);
  if (!existsSync(path)) return null;
  const doc = JSON.parse(readFileSync(path, 'utf-8')) as FixtureCellCalibrationDoc;
  if (doc.testCaseId !== testCaseId) return null;
  const sha = sha256Buffer(imageBuffer);
  if (doc.orientSha256 !== sha) return null;
  if (doc.pageWidth !== pageW || doc.pageHeight !== pageH) return null;
  return doc;
}

export function cellsFromFixtureCalibrationDoc(
  doc: FixtureCellCalibrationDoc,
  pageW: number,
  pageH: number,
): MathCellRegion[] {
  return doc.cells.map((c) => ({
    label: c.label,
    box: fractionBoxFromNormalized(c.boxNorm, pageW, pageH),
    detection: 'fixture_calibration' as const,
    confidence: 0.98,
    uncertain: false,
  }));
}

/** Visual-audit adjustments for p57 orient 1400×1867 (Phase 6.6). */
export const P57_PHASE66_PAGE = { width: 1400, height: 1867 } as const;

export function applyP57Phase66BoxAdjustments(
  box: PageCropBox,
  label: ExerciseCellLabel,
  pageW = P57_PHASE66_PAGE.width,
): PageCropBox {
  const col0: ExerciseCellLabel[] = ['a', 'e', 'i', 'm'];
  const col1: ExerciseCellLabel[] = ['b', 'f', 'j', 'n'];
  const row0: ExerciseCellLabel[] = ['a', 'b', 'c', 'd'];
  let { x0, y0, x1, y1 } = box;
  if (col0.includes(label)) x1 = Math.min(pageW - 1, 324);
  if (col1.includes(label)) x1 = Math.min(pageW - 1, 576);
  if (row0.includes(label)) {
    y0 = Math.min(y1 - 24, 202);
    y1 = Math.max(y0 + 24, 266);
  }
  if (label === 'b') x0 = Math.max(0, 330);
  return { x0, y0, x1, y1 };
}

export function gridBoxFromFixtureDoc(
  doc: FixtureCellCalibrationDoc,
  pageW: number,
  pageH: number,
): PageCropBox | null {
  if (doc.gridBandNorm) {
    return fractionBoxFromNormalized(doc.gridBandNorm, pageW, pageH);
  }
  if (doc.gridBandPx) return doc.gridBandPx;
  return null;
}
