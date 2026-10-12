/**
 * p57 divide grid — real image, real Paddle/Tess on VPS or local, optional live Pix2Text.
 *
 *   cd backend
 *   $env:OCR_PIX2TEXT_MATH_CROPS='1'
 *   npx tsx scripts/fractions-p57-grid-regression.ts
 *   npx tsx scripts/fractions-p57-grid-regression.ts --live-pix2text
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { prepareOrientedVariant } from '../src/lessons/page-image-prep';
import { PageOcrService } from '../src/lessons/page-ocr.service';
import { mergePageOcr } from '../src/lessons/ocr-layout-reconcile';
import { filterPageTextForLessonAssembly } from '../src/lessons/page-text-sanitize';
import { applyExerciseGridFusion } from '../src/lessons/ocr-exercise-grid-fusion';
import { applyPix2TextMathCropFusion } from '../src/lessons/ocr-pix2text-math-fusion';
import { normalizePix2TextPlain } from '../src/lessons/ocr-pix2text-latex-plain';

const ROOT = join(process.cwd(), 'test-fixtures', 'fractions-chapter-calibration');
const IMAGE = join(ROOT, 'p57-divide-grid.jpg');
const DATASET = JSON.parse(readFileSync(join(ROOT, 'chapter_dataset.json'), 'utf-8'));

function hit(label: string, text: string, expected: string): boolean {
  const t = normalizePix2TextPlain(text).toLowerCase().replace(/\s/g, '');
  const e = normalizePix2TextPlain(expected).toLowerCase().replace(/\s/g, '');
  return t.includes(`${label}.`) && t.includes(e.slice(0, Math.min(8, e.length)));
}

async function main() {
  const live = process.argv.includes('--live-pix2text');
  process.env.OCR_PIX2TEXT_MATH_CROPS = '1';

  if (!existsSync(IMAGE)) {
    console.error('Missing', IMAGE);
    process.exit(1);
  }

  const buffer = readFileSync(IMAGE);
  const file = {
    buffer,
    mimetype: 'image/jpeg',
    originalname: 'p57-divide-grid.jpg',
    size: buffer.length,
  } as Express.Multer.File;
  const variant = await prepareOrientedVariant(file, 0);
  const ocrFile = {
    ...file,
    buffer: variant.ocr.buffer,
    mimetype: variant.ocr.mimeType,
    originalname: variant.ocr.originalname,
    size: variant.ocr.size,
  } as Express.Multer.File;

  const sharp = await import('sharp');
  const sharpFn =
    (sharp as { default?: (i: Buffer) => import('sharp').Sharp }).default ??
    (sharp as unknown as (i: Buffer) => import('sharp').Sharp);
  const meta = await sharpFn(ocrFile.buffer).metadata();

  const ocr = new PageOcrService();
  const [{ paddle, tesseract, paddleLines, tesseractLines }] =
    await ocr.readPageOcrEnginesParallel([ocrFile], { subjectName: 'Mathematics' });

  const mergeC = filterPageTextForLessonAssembly(
    mergePageOcr({
      paddle,
      tesseract,
      paddleLines,
      tesseractLines,
      subjectName: 'Mathematics',
    }),
  );

  let runWorker: typeof import('../src/lessons/pix2text-math.runner').runPix2TextOnCrops | undefined;
  if (!live) {
    const pixPath = join(
      process.cwd(),
      'eval/specialized-math-ocr/outputs/p57-divide-grid__divide_grid__pix2text.txt',
    );
    if (!existsSync(pixPath)) {
      console.error('No fixture Pix2Text; use --live-pix2text');
      process.exit(1);
    }
    const pix2Raw = readFileSync(pixPath, 'utf-8');
    runWorker = async (crops) => ({
      ok: true,
      results: crops.map((c) => ({ id: c.id, ok: true, text: pix2Raw, ms: 0 })),
    });
  }

  const grid = await applyExerciseGridFusion({
    imageBuffer: ocrFile.buffer,
    imageWidth: meta.width ?? 0,
    imageHeight: meta.height ?? 0,
    baseTranscript: mergeC,
    paddleLines,
    tesseractLines,
    runWorker,
  });

  const portal = await applyPix2TextMathCropFusion({
    imageBuffer: ocrFile.buffer,
    imageWidth: meta.width ?? 0,
    imageHeight: meta.height ?? 0,
    baseTranscript: mergeC,
    paddleLines,
    tesseractLines,
    subjectName: 'Mathematics',
    runWorker,
  });

  const refs = DATASET.pages
    .find((p: { id: string }) => p.id === 'p57-divide-grid')
    .exerciseItems.filter((e: { reviewStatus: string }) => e.reviewStatus === 'reference');

  const report = {
    livePix2Text: live,
    mergeCPreview: mergeC.slice(0, 400),
    paddlePreview: paddle.slice(0, 400),
    tesseractPreview: tesseract.slice(0, 400),
    gridFusion: {
      applied: grid.applied,
      skippedReason: grid.skippedReason,
      cells: grid.cells,
      uncertain: grid.uncertainLabels,
      debug: grid.debug,
      textPreview: grid.text.slice(0, 1200),
    },
    portalPix2Path: {
      appliedRegions: portal.appliedRegions,
      skippedReason: portal.skippedReason,
      textPreview: portal.text.slice(0, 1200),
    },
    referenceHits: refs.map((r: { label: string; text: string }) => ({
      label: r.label,
      expected: r.text,
      inGridFusion: hit(r.label, grid.text, r.text),
      inPortalPath: hit(r.label, portal.text, r.text),
    })),
  };

  const outDir = join(ROOT, 'p57-grid-regression-reports');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'latest.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await ocr.onModuleDestroy?.();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
