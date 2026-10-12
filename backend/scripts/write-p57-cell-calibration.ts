/**
 * Write 4×4 equal cell calibration for verified p57 orient image.
 */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { prepareOrientedVariant } from '../src/lessons/page-image-prep';
import { imageDimensionsFromBuffer } from '../src/lessons/ocr-image-dimensions';
import {
  DIVIDE_GRID_CALIBRATION_BOX,
  fractionBoxFromNormalized,
  preciseDivideExerciseGridCrop,
} from '../src/lessons/ocr-exercise-grid-crop';
import { cellsFromEqualGrid } from '../src/lessons/ocr-math-cell-grid-detect';
import {
  DIVIDE_EXERCISE_GRID_COLUMNS,
  DIVIDE_EXERCISE_GRID_ROWS,
  EXERCISE_CELL_LABELS,
} from '../src/lessons/ocr-exercise-grid-cells';
import type { MathCellRegion } from '../src/lessons/ocr-math-cell-layout';

const EXPECTED_SHA = '59172c0be72d8f78d8593bceb068cce4b9064a4f18750343a41a085020133dd1';
const IMAGE = join(process.cwd(), 'test-fixtures/fractions-chapter-calibration/p57-divide-grid.jpg');
const OUT = join(process.cwd(), '../docs/ocr/ground_truth/p57-divide-grid-cell-calibration.json');

async function main() {
  const raw = readFileSync(IMAGE);
  const file = {
    buffer: raw,
    mimetype: 'image/jpeg',
    originalname: 'p57-divide-grid.jpg',
    size: raw.length,
  } as Express.Multer.File;
  const variant = await prepareOrientedVariant(file, 0);
  const buf = variant.ocr.buffer;
  const sha = createHash('sha256').update(buf).digest('hex');
  if (sha !== EXPECTED_SHA) {
    console.error('sha mismatch');
    process.exit(3);
  }
  const dims = await imageDimensionsFromBuffer(buf);
  const pageW = dims.width;
  const pageH = dims.height;

  const gridBox =
    preciseDivideExerciseGridCrop({
      pageWidth: pageW,
      pageHeight: pageH,
      transcript: '7. Divide the following fractions',
      calibrationBox: DIVIDE_GRID_CALIBRATION_BOX,
    }) ?? fractionBoxFromNormalized(DIVIDE_GRID_CALIBRATION_BOX, pageW, pageH);

  const colEdges = [0.04, 0.225, 0.405, 0.585, 0.72];
  const rowCount = DIVIDE_EXERCISE_GRID_ROWS;
  const rowH = (gridBox.y1 - gridBox.y0) / rowCount;
  const cells: MathCellRegion[] = [];
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < DIVIDE_EXERCISE_GRID_COLUMNS; c++) {
      const idx = r * DIVIDE_EXERCISE_GRID_COLUMNS + c;
      const label = EXERCISE_CELL_LABELS[idx];
      if (!label) break;
      const pad = 10;
      const x0 = colEdges[c] * pageW + pad;
      const x1 = colEdges[c + 1] * pageW - pad;
      const y0 = gridBox.y0 + r * rowH + pad;
      const y1 = gridBox.y0 + (r + 1) * rowH - pad;
      cells.push({
        label,
        box: { x0, y0, x1, y1 },
        detection: 'fixture_calibration',
        confidence: 0.92,
        uncertain: false,
      });
    }
  }

  const doc = {
    testCaseId: 'p57-divide-grid',
    orientSha256: sha,
    pageWidth: pageW,
    pageHeight: pageH,
    coordinateSystem: 'orient_ocr_file_pixels_top_left',
    derivation: 'equal_4x4_grid_band_v1',
    gridLayout: { columns: 4, rows: 4 },
    gridBandNorm: DIVIDE_GRID_CALIBRATION_BOX,
    gridBandPx: gridBox,
    cells: cells.map((c) => ({
      label: c.label,
      boxNorm: [c.box.x0 / pageW, c.box.y0 / pageH, c.box.x1 / pageW, c.box.y1 / pageH] as [
        number,
        number,
        number,
        number,
      ],
      boxPx: c.box,
    })),
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(doc, null, 2));
  console.log('wrote', OUT, 'cells', cells.length, 'gridBox', gridBox);
}

main();
