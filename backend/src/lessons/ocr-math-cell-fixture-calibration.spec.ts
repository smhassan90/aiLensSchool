import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import {
  applyP57Phase66BoxAdjustments,
  loadFixtureCellCalibration,
  sha256Buffer,
} from './ocr-math-cell-fixture-calibration';
import { prepareOrientedVariant } from './page-image-prep';
import { imageDimensionsFromBuffer } from './ocr-image-dimensions';

const IMAGE = join(
  process.cwd(),
  'test-fixtures/fractions-chapter-calibration/p57-divide-grid.jpg',
);
const EXPECTED_SHA = '59172c0be72d8f78d8593bceb068cce4b9064a4f18750343a41a085020133dd1';

describe('ocr-math-cell-fixture-calibration', () => {
  it('loads p57 calibration when sha and dimensions match', async () => {
    const raw = readFileSync(IMAGE);
    const file = {
      buffer: raw,
      mimetype: 'image/jpeg',
      originalname: 'p57-divide-grid.jpg',
      size: raw.length,
    } as Express.Multer.File;
    const variant = await prepareOrientedVariant(file, 0);
    const buf = variant.ocr.buffer;
    expect(sha256Buffer(buf)).toBe(EXPECTED_SHA);
    const dims = await imageDimensionsFromBuffer(buf);
    const doc = loadFixtureCellCalibration('p57-divide-grid', buf, dims.width, dims.height);
    expect(doc).not.toBeNull();
    expect(doc!.cells.length).toBeGreaterThanOrEqual(14);
    expect(doc!.cells.find((c) => c.label === 'a')?.boxNorm).toHaveLength(4);
  });

  it('rejects calibration on wrong buffer', async () => {
    const doc = loadFixtureCellCalibration('p57-divide-grid', Buffer.from('x'), 1400, 1867);
    expect(doc).toBeNull();
  });

  it('phase 6.6 expands col0/col1 width without leaving page bounds', () => {
    const eBase = { x0: 66, y0: 281.6485, x1: 305, y1: 350.331 };
    const eNew = applyP57Phase66BoxAdjustments(eBase, 'e');
    expect(eNew.x1).toBe(324);
    expect(eNew.x1).toBeGreaterThan(eBase.x1);
    const nBase = { x0: 325, y0: 459.0135, x1: 557, y1: 527.696 };
    const nNew = applyP57Phase66BoxAdjustments(nBase, 'n');
    expect(nNew.x1).toBe(576);
    expect(nNew.x1).toBeGreaterThan(nBase.x1);
    const bBase = { x0: 325, y0: 192.966, x1: 557, y1: 261.6485 };
    const bNew = applyP57Phase66BoxAdjustments(bBase, 'b');
    expect(bNew.y0).toBeGreaterThan(bBase.y0);
    expect(bNew.x0).toBeGreaterThan(bBase.x0);
  });

  it('rejects calibration on wrong dimensions', async () => {
    const raw = readFileSync(IMAGE);
    const file = {
      buffer: raw,
      mimetype: 'image/jpeg',
      originalname: 'p57-divide-grid.jpg',
      size: raw.length,
    } as Express.Multer.File;
    const variant = await prepareOrientedVariant(file, 0);
    const buf = variant.ocr.buffer;
    const doc = loadFixtureCellCalibration('p57-divide-grid', buf, 1399, 1867);
    expect(doc).toBeNull();
  });
});
