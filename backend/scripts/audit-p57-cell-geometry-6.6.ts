/**
 * Phase 6.6 geometry audit — visuals + report (no OCR accuracy experiment).
 * Usage: npx tsx scripts/audit-p57-cell-geometry-6.6.ts
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { prepareOrientedVariant } from '../src/lessons/page-image-prep';
import { detectDivideExerciseGridLayout } from '../src/lessons/ocr-math-cell-layout';
import { validateCellCropGeometry } from '../src/lessons/ocr-math-cell-geometry';
import { cropPageRegion } from '../src/lessons/ocr-region-image-prep';
import { imageDimensionsFromBuffer } from '../src/lessons/ocr-image-dimensions';
import { EXERCISE_CELL_LABELS } from '../src/lessons/ocr-exercise-grid-cells';
import type { PageCropBox } from '../src/lessons/ocr-region-image-prep';
import { applyP57Phase66BoxAdjustments } from '../src/lessons/ocr-math-cell-fixture-calibration';

const OUT = join(process.cwd(), 'var/math-cell-eval/p57-6.6');
const CAL_PATH = join(process.cwd(), '../docs/ocr/ground_truth/p57-divide-grid-cell-calibration.json');
const BASELINE_CAL_BACKUP = join(OUT, 'p57-divide-grid-cell-calibration-6.3-baseline.json');
const IMAGE = join(process.cwd(), 'test-fixtures/fractions-chapter-calibration/p57-divide-grid.jpg');
const EXPECTED_ORIENT_SHA = '59172c0be72d8f78d8593bceb068cce4b9064a4f18750343a41a085020133dd1';
const TARGETS = ['a', 'b', 'e', 'n'] as const;
const PAGE_W = 1400;
const PAGE_H = 1867;

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function toNorm(box: PageCropBox): [number, number, number, number] {
  return [box.x0 / PAGE_W, box.y0 / PAGE_H, box.x1 / PAGE_W, box.y1 / PAGE_H];
}

async function drawGrid(
  orientBuf: Buffer,
  cells: Array<{ label: string; box: PageCropBox; style: 'baseline' | 'proposed' }>,
  gridBox: PageCropBox,
): Promise<Buffer> {
  const meta = await sharp(orientBuf).metadata();
  const w = meta.width ?? PAGE_W;
  const h = meta.height ?? PAGE_H;
  const parts: string[] = [
    `<rect x="${gridBox.x0}" y="${gridBox.y0}" width="${gridBox.x1 - gridBox.x0}" height="${gridBox.y1 - gridBox.y0}" fill="none" stroke="#888" stroke-width="2" stroke-dasharray="8,4"/>`,
  ];
  for (const c of cells) {
    const stroke = c.style === 'baseline' ? '#00aa00' : '#cc0000';
    const dash = c.style === 'baseline' ? '' : ' stroke-dasharray="6,3"';
    parts.push(
      `<rect x="${c.box.x0}" y="${c.box.y0}" width="${c.box.x1 - c.box.x0}" height="${c.box.y1 - c.box.y0}" fill="none" stroke="${stroke}" stroke-width="2"${dash}/>`,
    );
    parts.push(
      `<text x="${c.box.x0 + 3}" y="${c.box.y0 + 14}" font-size="13" fill="${stroke}">${c.label}${c.style === 'proposed' ? '*' : ''}</text>`,
    );
  }
  const svg = `<svg width="${w}" height="${h}">${parts.join('')}</svg>`;
  return sharp(orientBuf).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 92 }).toBuffer();
}

async function contactSheet(
  pairs: Array<{ label: string; before: Buffer; after: Buffer }>,
): Promise<Buffer> {
  const tiles: Buffer[] = [];
  for (const p of pairs) {
    const b = await sharp(p.before).resize(280, 90, { fit: 'inside', background: '#eee' }).jpeg().toBuffer();
    const a = await sharp(p.after).resize(280, 90, { fit: 'inside', background: '#eee' }).jpeg().toBuffer();
    tiles.push(b, a);
  }
  const row = await sharp({
    create: { width: 560, height: 90, channels: 3, background: '#fff' },
  })
    .composite([
      { input: tiles[0], left: 0, top: 0 },
      { input: tiles[1], left: 280, top: 0 },
    ])
    .jpeg()
    .toBuffer();
  // build 4 rows for a,b,e,n
  const rows: Buffer[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const b = await sharp(pairs[i].before).resize(280, 90, { fit: 'inside', background: '#eee' }).jpeg().toBuffer();
    const a = await sharp(pairs[i].after).resize(280, 90, { fit: 'inside', background: '#eee' }).jpeg().toBuffer();
    rows.push(
      await sharp({ create: { width: 560, height: 90, channels: 3, background: '#fff' } })
        .composite([{ input: b, left: 0, top: 0 }, { input: a, left: 280, top: 0 }])
        .jpeg()
        .toBuffer(),
    );
  }
  const h = 90 * rows.length;
  return sharp({ create: { width: 560, height: h, channels: 3, background: '#fff' } })
    .composite(rows.map((r, i) => ({ input: r, left: 0, top: i * 90 })))
    .jpeg()
    .toBuffer();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const baselinePath = existsSync(BASELINE_CAL_BACKUP)
    ? BASELINE_CAL_BACKUP
    : CAL_PATH;
  const cal = JSON.parse(readFileSync(baselinePath, 'utf-8'));
  if (!existsSync(BASELINE_CAL_BACKUP)) {
    writeFileSync(BASELINE_CAL_BACKUP, JSON.stringify(cal, null, 2));
  }

  const raw = readFileSync(IMAGE);
  const file = {
    buffer: raw,
    mimetype: 'image/jpeg',
    originalname: 'p57-divide-grid.jpg',
    size: raw.length,
  } as Express.Multer.File;
  const variant = await prepareOrientedVariant(file, 0);
  const orientBuf = variant.ocr.buffer;
  const orientSha = sha256(orientBuf);
  if (orientSha !== EXPECTED_ORIENT_SHA) {
    console.error('sha mismatch', orientSha);
    process.exit(3);
  }

  const baselineBoxes = new Map<string, PageCropBox>();
  for (const c of cal.cells as Array<{ label: string; boxPx: PageCropBox }>) {
    baselineBoxes.set(c.label, { ...c.boxPx });
  }

  const proposedBoxes = new Map<string, PageCropBox>();
  for (const label of EXERCISE_CELL_LABELS) {
    const base = baselineBoxes.get(label);
    if (!base) continue;
    proposedBoxes.set(label, applyP57Phase66BoxAdjustments(base, label));
  }

  // Persist proposed calibration
  const updated = {
    ...cal,
    derivation: 'equal_4x4_grid_band_v1_phase_6_6_divisor_pad',
    cells: (cal.cells as Array<{ label: string; boxPx: PageCropBox }>).map((c) => {
      const boxPx = proposedBoxes.get(c.label) ?? c.boxPx;
      return { label: c.label, boxNorm: toNorm(boxPx), boxPx };
    }),
  };
  writeFileSync(CAL_PATH, JSON.stringify(updated, null, 2));

  const dims = await imageDimensionsFromBuffer(orientBuf);
  const layout = await detectDivideExerciseGridLayout({
    imageBuffer: orientBuf,
    pageWidth: dims.width,
    pageHeight: dims.height,
    transcript: '7. Divide the following fractions',
    paddleLines: [],
    tesseractLines: [],
    testCaseId: 'p57-divide-grid',
  });
  if (!layout) throw new Error('layout failed');

  const overlayCells: Array<{ label: string; box: PageCropBox; style: 'baseline' | 'proposed' }> = [];
  for (const label of EXERCISE_CELL_LABELS) {
    const cell = layout.cells.find((c) => c.label === label);
    if (!cell) continue;
    const base = baselineBoxes.get(label)!;
    overlayCells.push({ label, box: base, style: 'baseline' });
    overlayCells.push({ label, box: proposedBoxes.get(label)!, style: 'proposed' });
  }
  const annotated = await drawGrid(orientBuf, overlayCells, layout.gridBox);
  writeFileSync(join(OUT, 'grid-annotated-baseline-vs-proposed.jpg'), annotated);

  const contactPairs: Array<{ label: string; before: Buffer; after: Buffer }> = [];
  const auditRows: Record<string, unknown> = {};

  for (const label of EXERCISE_CELL_LABELS) {
    const base = baselineBoxes.get(label);
    const prop = proposedBoxes.get(label);
    if (!base || !prop) continue;
    const geomBase = await validateCellCropGeometry({
      imageBuffer: orientBuf,
      pageWidth: dims.width,
      pageHeight: dims.height,
      label,
      box: base,
    });
    const geomProp = await validateCellCropGeometry({
      imageBuffer: orientBuf,
      pageWidth: dims.width,
      pageHeight: dims.height,
      label,
      box: prop,
    });
    const cropBefore = await cropPageRegion(orientBuf, geomBase.paddedBox, 'original');
    const cropAfter = await cropPageRegion(orientBuf, geomProp.paddedBox, 'original');
    writeFileSync(join(OUT, `crop-${label}-before.jpg`), cropBefore);
    writeFileSync(join(OUT, `crop-${label}-after.jpg`), cropAfter);
    if ((TARGETS as readonly string[]).includes(label)) {
      contactPairs.push({ label, before: cropBefore, after: cropAfter });
    }
    auditRows[label] = {
      baselineBox: base,
      proposedBox: prop,
      baselinePadded: geomBase.paddedBox,
      proposedPadded: geomProp.paddedBox,
      cropHashBefore: sha256(cropBefore),
      cropHashAfter: sha256(cropAfter),
      widthBefore: geomBase.width,
      widthAfter: geomProp.width,
    };
  }

  const sheet = await contactSheet(contactPairs);
  writeFileSync(join(OUT, 'contact-sheet-a-b-e-n.jpg'), sheet);

  const report = {
    experiment: '6.6',
    coordinateSystem: 'orient_ocr_file_pixels_top_left',
    orientSha256: orientSha,
    pageWidth: dims.width,
    pageHeight: dims.height,
    clippingConfirmed: { e: true, n: true },
    headingBleedConfirmed: { b: true },
    adjustments: {
      col0_x1_px: 324,
      col1_x1_px: 576,
      row0_y0_px: 202,
      row0_y1_px: 266,
      b_x0_px: 330,
    },
    all14Labels: EXERCISE_CELL_LABELS,
    cells: auditRows,
    artifacts: {
      annotated: 'grid-annotated-baseline-vs-proposed.jpg',
      contactSheet: 'contact-sheet-a-b-e-n.jpg',
      baselineCalibrationBackup: 'p57-divide-grid-cell-calibration-6.3-baseline.json',
    },
  };
  writeFileSync(join(OUT, 'report-6.6.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ out: OUT, report }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
