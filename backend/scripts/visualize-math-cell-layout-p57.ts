/**
 * Layout visualization for p57 divide grid (geometry only).
 * Usage: npx tsx scripts/visualize-math-cell-layout-p57.ts
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { prepareOrientedVariant } from '../src/lessons/page-image-prep';
import { PageOcrService } from '../src/lessons/page-ocr.service';
import { mergePageOcr } from '../src/lessons/ocr-layout-reconcile';
import { filterPageTextForLessonAssembly } from '../src/lessons/page-text-sanitize';
import { detectDivideExerciseGridLayout } from '../src/lessons/ocr-math-cell-layout';
import { geometricDivideGridCells } from '../src/lessons/ocr-math-cell-layout';
import { validateCellCropGeometry, padCellBox } from '../src/lessons/ocr-math-cell-geometry';
import { cropPageRegion } from '../src/lessons/ocr-region-image-prep';
import { imageDimensionsFromBuffer } from '../src/lessons/ocr-image-dimensions';

const EXPECTED_ORIENT_SHA = '59172c0be72d8f78d8593bceb068cce4b9064a4f18750343a41a085020133dd1';
const IMAGE = join(process.cwd(), 'test-fixtures/fractions-chapter-calibration/p57-divide-grid.jpg');
const OUT = join(process.cwd(), 'var/math-cell-layout-viz/p57');
const TARGETS = ['a', 'b', 'e', 'n'] as const;

async function drawOverlay(
  imageBuffer: Buffer,
  boxes: Array<{ label: string; box: { x0: number; y0: number; x1: number; y1: number }; color: string }>,
): Promise<Buffer> {
  const sharpModule = await import('sharp');
  const sharp =
    (sharpModule as { default?: (i: Buffer) => import('sharp').Sharp }).default ??
    (sharpModule as unknown as (i: Buffer) => import('sharp').Sharp);
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const rects = boxes
    .map(
      (b) =>
        `<rect x="${b.box.x0}" y="${b.box.y0}" width="${b.box.x1 - b.box.x0}" height="${b.box.y1 - b.box.y0}" fill="none" stroke="${b.color}" stroke-width="3"/><text x="${b.box.x0 + 4}" y="${b.box.y0 + 18}" font-size="20" fill="${b.color}">${b.label}</text>`,
    )
    .join('');
  const svg = `<svg width="${w}" height="${h}">${rects}</svg>`;
  return sharp(imageBuffer).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg().toBuffer();
}

async function main() {
  if (!existsSync(IMAGE)) {
    console.error('missing', IMAGE);
    process.exit(2);
  }
  mkdirSync(OUT, { recursive: true });

  const raw = readFileSync(IMAGE);
  const file = {
    buffer: raw,
    mimetype: 'image/jpeg',
    originalname: 'p57-divide-grid.jpg',
    size: raw.length,
  } as Express.Multer.File;

  const variant = await prepareOrientedVariant(file, 0);
  const orientBuf = variant.ocr.buffer;
  const orientSha = createHash('sha256').update(orientBuf).digest('hex');
  if (orientSha !== EXPECTED_ORIENT_SHA) {
    console.error('orient sha mismatch', orientSha, 'expected', EXPECTED_ORIENT_SHA);
    process.exit(3);
  }

  const dims = await imageDimensionsFromBuffer(orientBuf);
  writeFileSync(join(OUT, 'orient_ocr_file.jpg'), orientBuf);

  const geometryOnly = process.env.MATH_CELL_GEOMETRY_ONLY === '1';
  let ruleMerged = '7. Divide the following fractions';
  let paddleLines: import('../src/lessons/ocr-structured-line').OcrStructuredLine[] = [];
  let tesseractLines: import('../src/lessons/ocr-structured-line').OcrStructuredLine[] = [];
  if (!geometryOnly) {
    const pageOcr = new PageOcrService();
    const [engines] = await pageOcr.readPageOcrEnginesParallel(
      [{ buffer: orientBuf, mimetype: 'image/jpeg', originalname: 'orient.jpg' }],
      { subjectName: 'Mathematics' },
    );
    paddleLines = engines.paddleLines ?? [];
    tesseractLines = engines.tesseractLines ?? [];
    ruleMerged = filterPageTextForLessonAssembly(
      mergePageOcr({
        paddle: engines.paddle,
        tesseract: engines.tesseract,
        paddleLines,
        tesseractLines,
        subjectName: 'Mathematics',
      }),
    );
  }

  const layout = await detectDivideExerciseGridLayout({
    imageBuffer: orientBuf,
    transcript: ruleMerged,
    paddleLines,
    tesseractLines,
    testCaseId: 'p57-divide-grid',
  });
  if (!layout) {
    console.error('no layout');
    process.exit(4);
  }

  const oldCells = geometricDivideGridCells(layout.gridBox);
  const meta: Record<string, unknown> = {
    orientSha256: orientSha,
    dimensions: dims,
    gridBox: layout.gridBox,
    gridLines: layout.gridLines,
    cells: [],
    targetCells: {},
    oldEqualGridSample: {},
  };

  const overlayNew = [
    { label: 'GRID', box: layout.gridBox, color: '#0066ff' },
    ...layout.cells.map((c) => ({
      label: c.label,
      box: c.box,
      color: c.detection === 'fixture_calibration' ? '#00cc66' : '#ff9900',
    })),
  ];
  const overlayOld = oldCells
    .filter((c) => TARGETS.includes(c.label as typeof TARGETS[number]))
    .map((c) => ({ label: `${c.label}'`, box: c.box, color: '#cc0000' }));

  const annotated = await drawOverlay(orientBuf, [...overlayNew, ...overlayOld]);
  writeFileSync(join(OUT, 'annotated-new-vs-old-equal.jpg'), annotated);

  for (const label of TARGETS) {
    const cell = layout.cells.find((c) => c.label === label);
    const old = oldCells.find((c) => c.label === label);
    if (!cell) continue;
    const geom = await validateCellCropGeometry({
      imageBuffer: orientBuf,
      pageWidth: dims.width,
      pageHeight: dims.height,
      label,
      box: cell.box,
    });
    const padded = padCellBox(cell.box, 6, dims.width, dims.height);
    const crop = await cropPageRegion(orientBuf, padded, 'original');
    const hash = createHash('sha256').update(crop).digest('hex');
    writeFileSync(join(OUT, `crop-${label}-new.jpg`), crop);
    if (old) {
      const oldCrop = await cropPageRegion(orientBuf, old.box, 'original');
      writeFileSync(join(OUT, `crop-${label}-old-equal.jpg`), oldCrop);
      (meta.oldEqualGridSample as Record<string, unknown>)[label] = {
        box: old.box,
        sha256: createHash('sha256').update(oldCrop).digest('hex'),
      };
    }
    (meta.targetCells as Record<string, unknown>)[label] = {
      box: cell.box,
      paddedBox: padded,
      geometry: geom,
      cropSha256: hash,
      width: geom.width,
      height: geom.height,
    };
  }

  for (const c of layout.cells) {
    (meta.cells as unknown[]).push({
      label: c.label,
      box: c.box,
      detection: c.detection,
      confidence: c.confidence,
      uncertain: c.uncertain,
    });
  }

  writeFileSync(join(OUT, 'layout-metadata.json'), JSON.stringify(meta, null, 2));
  console.log(JSON.stringify({ outDir: OUT, orientSha, dimensions: dims }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
