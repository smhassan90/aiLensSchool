/**
 * Portal OCR + acceptance checks for one fractions lesson page.
 * Usage: npx ts-node --transpile-only scripts/fractions-portal-cycle.ts <image> [--json manifestId]
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { PageOcrService } from '../src/lessons/page-ocr.service';
import { mergePaddleAndTesseractPageOcr } from '../src/lessons/merge-paddle-tesseract-ocr';
import {
  orientationCandidates,
  prepareOrientedVariant,
} from '../src/lessons/page-image-prep';
import {
  compareOrientationOcrResults,
  englishPageTranscriptLooksIncomplete,
  filterPageTextForLessonAssembly,
  isPagePhotoTextReadable,
  mergeDualChannelPageOcr,
  OrientationOcrCandidate,
  scorePageOcrCandidate,
} from '../src/lessons/page-text-sanitize';

type PageSpec = {
  id: string;
  mustMatch?: string[];
  mustNotMatch?: string[];
};

async function portalOcr(imagePath: string): Promise<{ merged: string; paddle: string; tesseract: string }> {
  const buffer = readFileSync(imagePath);
  const file = {
    buffer,
    mimetype: 'image/jpeg',
    originalname: 'page.jpg',
    size: buffer.length,
  } as Express.Multer.File;

  const ocr = new PageOcrService();
  const sharpModule = await import('sharp');
  const sharpFn =
    (sharpModule as { default?: (i: Buffer) => import('sharp').Sharp }).default ??
    (sharpModule as unknown as (i: Buffer) => import('sharp').Sharp);
  const afterExif = await sharpFn(buffer).rotate().toBuffer({ resolveWithObject: true });

  let best: OrientationOcrCandidate | undefined;
  let bestFile: Express.Multer.File | undefined;
  for (const deg of orientationCandidates(afterExif.info.width, afterExif.info.height)) {
    const variant = await prepareOrientedVariant(file, deg);
    const grey = { ...file, buffer: variant.ocr.buffer, size: variant.ocr.size } as Express.Multer.File;
    const color = { ...file, buffer: variant.vision.buffer, size: variant.vision.size } as Express.Multer.File;
    const [[g], [c]] = await Promise.all([
      ocr.readTesseractPageTexts([grey], { subjectName: 'Mathematics' }),
      ocr.readTesseractPageTexts([color], { subjectName: 'Mathematics' }),
    ]);
    const text = mergeDualChannelPageOcr(g ?? '', c ?? '');
    const score = scorePageOcrCandidate(text, { englishPrimary: false });
    const readable =
      isPagePhotoTextReadable(text) && !englishPageTranscriptLooksIncomplete(text);
    const candidate: OrientationOcrCandidate = { text, score, readable, degrees: deg };
    if (compareOrientationOcrResults(best, candidate) > 0) {
      best = candidate;
      bestFile = grey;
    }
  }
  if (!bestFile) throw new Error('orientation failed');

  const [{ paddle, tesseract }] = await ocr.readPageOcrEnginesParallel([bestFile], {
    subjectName: 'Mathematics',
  });
  const merged = filterPageTextForLessonAssembly(
    mergePaddleAndTesseractPageOcr(paddle, tesseract),
  );
  await ocr.onModuleDestroy?.();
  return { merged, paddle, tesseract };
}

function evaluate(merged: string, spec: PageSpec) {
  const checks: Record<string, boolean> = {};
  for (const pat of spec.mustMatch ?? []) {
    checks[`match:${pat}`] = new RegExp(pat, 'i').test(merged);
  }
  for (const pat of spec.mustNotMatch ?? []) {
    checks[`not:${pat}`] = !new RegExp(pat, 'i').test(merged);
  }
  const pass = Object.values(checks).every(Boolean);
  return { pass, checks };
}

async function main() {
  const imagePath = process.argv[2];
  const pageId = process.argv.find((a) => a.startsWith('--page='))?.slice(7) ?? '01-unit-opener';
  if (!imagePath) {
    console.error('Usage: fractions-portal-cycle.ts <image> [--page=id]');
    process.exit(2);
  }

  const manifestPath = join(process.cwd(), 'ocr', 'training', 'fractions_pages_manifest.json');
  const pages: PageSpec[] = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const spec = pages.find((p) => p.id === pageId) ?? { id: pageId, mustMatch: ['Fraction'] };

  const { merged, paddle, tesseract } = await portalOcr(imagePath);
  const { pass, checks } = evaluate(merged, spec);
  const outPath = join(process.cwd(), 'test-fixtures', `fractions-cycle-${pageId}.json`);
  writeFileSync(
    outPath,
    JSON.stringify({ pageId, pass, checks, merged, paddle, tesseract }, null, 2),
  );
  console.log(JSON.stringify({ pageId, pass, checks, outPath }, null, 2));
  console.log('\n===== MERGED =====\n' + merged);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
