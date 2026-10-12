/**
 * Phase 6.7 — ink-guided segmentation + optional OCR validation.
 * Usage: npx tsx scripts/experiment-math-cell-phase-6.7.ts
 * Optional OCR: PHASE67_RUN_OCR=1
 */
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { prepareOrientedVariant } from '../src/lessons/page-image-prep';
import { detectDivideExerciseGridLayout } from '../src/lessons/ocr-math-cell-layout';
import { cellsFromFixtureCalibrationDoc, loadFixtureCellCalibration } from '../src/lessons/ocr-math-cell-fixture-calibration';
import { refineDivideCellsWithInkGuidance } from '../src/lessons/ocr-math-cell-ink-guided';
import { validateCellCropGeometry } from '../src/lessons/ocr-math-cell-geometry';
import { cropPageRegion } from '../src/lessons/ocr-region-image-prep';
import { imageDimensionsFromBuffer } from '../src/lessons/ocr-image-dimensions';
import { scoreCellPrediction } from '../src/lessons/ocr-diagnostic/evaluate-ground-truth';
import { runMathCellPix2TextBatch } from '../src/lessons/ocr-math-cell-pix2text';
import { pix2textPlainForFusion } from '../src/lessons/ocr-pix2text-latex-plain';

const OUT = join(process.cwd(), 'var/math-cell-eval/p57-6.7');
const IMAGE = join(process.cwd(), 'test-fixtures/fractions-chapter-calibration/p57-divide-grid.jpg');
const GT = join(process.cwd(), '../docs/ocr/ground_truth/p57-divide-grid.json');
const EXPECTED_ORIENT_SHA = '59172c0be72d8f78d8593bceb068cce4b9064a4f18750343a41a085020133dd1';
const TARGETS = ['a', 'b', 'e', 'n'] as const;

function sha(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

async function cropForBox(orient: Buffer, box: { x0: number; y0: number; x1: number; y1: number }) {
  const geom = await validateCellCropGeometry({
    imageBuffer: orient,
    pageWidth: 1400,
    pageHeight: 1867,
    label: 'a',
    box,
  });
  return cropPageRegion(orient, geom.paddedBox, 'original');
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const gtCells = JSON.parse(readFileSync(GT, 'utf-8')).cells as Array<{ label: string; text: string }>;
  const raw = readFileSync(IMAGE);
  const file = {
    buffer: raw,
    mimetype: 'image/jpeg',
    originalname: 'p57-divide-grid.jpg',
    size: raw.length,
  } as Express.Multer.File;

  const t0 = Date.now();
  const variant = await prepareOrientedVariant(file, 0);
  const orient = variant.ocr.buffer;
  if (sha(orient) !== EXPECTED_ORIENT_SHA) throw new Error('orient sha mismatch');

  const dims = await imageDimensionsFromBuffer(orient);
  const fixture = loadFixtureCellCalibration('p57-divide-grid', orient, dims.width, dims.height);
  if (!fixture) throw new Error('fixture calibration missing');

  const nominal66 = cellsFromFixtureCalibrationDoc(fixture, dims.width, dims.height);
  const backupPath = join(process.cwd(), 'var/math-cell-eval/p57-6.6/p57-divide-grid-cell-calibration-6.3-baseline.json');
  const backup = JSON.parse(readFileSync(backupPath, 'utf-8'));
  const equal63 = cellsFromFixtureCalibrationDoc(backup, dims.width, dims.height);

  const layoutEqual = await detectDivideExerciseGridLayout({
    imageBuffer: orient,
    pageWidth: dims.width,
    pageHeight: dims.height,
    transcript: '7. Divide the following fractions',
    paddleLines: [],
    tesseractLines: [],
    testCaseId: 'p57-divide-grid',
  });
  if (!layoutEqual) throw new Error('layout failed');

  process.env.OCR_MATH_CELL_INK_GUIDED = '1';
  const layoutInk = await detectDivideExerciseGridLayout({
    imageBuffer: orient,
    pageWidth: dims.width,
    pageHeight: dims.height,
    transcript: '7. Divide the following fractions',
    paddleLines: [],
    tesseractLines: [],
    testCaseId: 'p57-divide-grid',
  });
  delete process.env.OCR_MATH_CELL_INK_GUIDED;

  const inkRefined = await refineDivideCellsWithInkGuidance({
    imageBuffer: orient,
    pageWidth: dims.width,
    pageHeight: dims.height,
    gridBox: layoutEqual.gridBox,
    nominalCells: nominal66,
  });

  const geomMs = Date.now() - t0;
  const byLabel = (cells: typeof nominal66) => new Map(cells.map((c) => [c.label, c.box]));

  const mapEqual = byLabel(equal63);
  const map66 = byLabel(nominal66);
  const mapInk = byLabel(layoutInk?.cells ?? []);

  const comparisons: Record<string, unknown> = {};
  for (const label of TARGETS) {
    const expected = gtCells.find((g) => g.label === label)?.text ?? '';
    const cropA = await cropForBox(orient, mapEqual.get(label)!);
    const cropB = await cropForBox(orient, map66.get(label)!);
    const cropC = await cropForBox(orient, mapInk.get(label)!);
    const inkRow = inkRefined.find((r) => r.label === label);
    const cropD = inkRow
      ? await cropPageRegion(
          orient,
          (
            await validateCellCropGeometry({
              imageBuffer: orient,
              pageWidth: dims.width,
              pageHeight: dims.height,
              label,
              box: {
                x0: Math.min(inkRow.nominalBox.x0, inkRow.semanticBox.x0),
                y0: Math.min(inkRow.nominalBox.y0, inkRow.semanticBox.y0),
                x1: Math.max(inkRow.nominalBox.x1, inkRow.semanticBox.x1),
                y1: Math.max(inkRow.nominalBox.y1, inkRow.semanticBox.y1),
              },
            })
          ).paddedBox,
          'original',
        )
      : cropC;

    writeFileSync(join(OUT, `crop-${label}-A-equal63.jpg`), cropA);
    writeFileSync(join(OUT, `crop-${label}-B-phase66.jpg`), cropB);
    writeFileSync(join(OUT, `crop-${label}-C-ink-guided.jpg`), cropC);
    writeFileSync(join(OUT, `crop-${label}-D-union-diagnostic.jpg`), cropD);

    comparisons[label] = {
      boxes: {
        equal63: mapEqual.get(label),
        phase66: map66.get(label),
        inkGuided: mapInk.get(label),
      },
      inkStatus: inkRow?.status,
      inkReasons: inkRow?.reasons,
      hashes: {
        A: sha(cropA),
        B: sha(cropB),
        C: sha(cropC),
        D: sha(cropD),
      },
      geometryOnly: true,
    };
  }

  // Annotated visualization
  const overlayParts: string[] = [];
  for (const label of TARGETS) {
    const ink = mapInk.get(label)!;
    overlayParts.push(
      `<rect x="${ink.x0}" y="${ink.y0}" width="${ink.x1 - ink.x0}" height="${ink.y1 - ink.y0}" fill="none" stroke="#cc0000" stroke-width="2"/>`,
    );
    const nom = map66.get(label)!;
    overlayParts.push(
      `<rect x="${nom.x0}" y="${nom.y0}" width="${nom.x1 - nom.x0}" height="${nom.y1 - nom.y0}" fill="none" stroke="#00aa00" stroke-width="1" stroke-dasharray="4,3"/>`,
    );
    const row = inkRefined.find((r) => r.label === label);
    if (row?.inkBounds) {
      const b = row.inkBounds;
      overlayParts.push(
        `<rect x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" fill="none" stroke="#0066cc" stroke-width="1"/>`,
      );
    }
  }
  const svg = `<svg width="${dims.width}" height="${dims.height}">${overlayParts.join('')}</svg>`;
  await sharp(orient)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toFile(join(OUT, 'grid-ink-annotated.jpg'));

  async function pix2Strict(variant: 'B' | 'C') {
    process.env.OCR_PIX2TEXT_MATH_CROPS = '1';
    const suffix = variant === 'B' ? 'B-phase66' : 'C-ink-guided';
    const crops = TARGETS.map((l) => ({
      label: l,
      buffer: readFileSync(join(OUT, `crop-${l}-${suffix}.jpg`)),
    }));
    const tOcr = Date.now();
    const batch = await runMathCellPix2TextBatch({
      crops: crops.map((c) => ({ label: c.label as 'a', buffer: c.buffer })),
    });
    process.env.OCR_PIX2TEXT_MATH_CROPS = '0';
    const rows = batch.batches[0]?.rows.map((r) => {
      const expected = gtCells.find((g) => g.label === r.label)?.text ?? '';
      const scored = scoreCellPrediction(r.label, expected, pix2textPlainForFusion(r.rawLatex));
      return {
        label: r.label,
        expected,
        plain: r.plainForFusion,
        rawLatex: r.rawLatex,
        strict: scored,
      };
    });
    const exact = rows?.filter((r) => r.strict.strictExpressionMatch).length ?? 0;
    return {
      cropVariant: variant,
      wallMs: Date.now() - tOcr,
      loadMs: batch.batches[0]?.batch.loadMs,
      strictExact: `${exact}/${TARGETS.length}`,
      rows,
    };
  }

  let ocr: unknown = null;
  if (process.env.PHASE67_RUN_OCR === '1') {
    ocr = {
      pix2text: {
        phase66: await pix2Strict('B'),
        inkGuided: await pix2Strict('C'),
      },
    };
  }

  writeFileSync(
    join(OUT, 'geometry-metadata.json'),
    JSON.stringify(
      {
        orientSha256: EXPECTED_ORIENT_SHA,
        gridBox: layoutEqual.gridBox,
        inkRefined,
        layoutInkCells: layoutInk?.cells.filter((c) => (TARGETS as readonly string[]).includes(c.label)),
      },
      null,
      2,
    ),
  );

  const report = {
    experiment: '6.7',
    orientSha256: EXPECTED_ORIENT_SHA,
    flags: { OCR_MATH_CELL_INK_GUIDED: 'off default; on during ink layout path' },
    timing: { geometryMs: geomMs },
    inkRefined: inkRefined.filter((r) => (TARGETS as readonly string[]).includes(r.label)),
    comparisons,
    strictOcr: ocr,
    evaluatedExpressionCount: TARGETS.length,
    fixtureCount: 1,
  };
  writeFileSync(join(OUT, 'report-6.7.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ out: OUT, report }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
