/**
 * Simulate portal chapter upload OCR for fractions page 57.
 * Usage: npx ts-node --transpile-only scripts/portal-ocr-page57.ts [imagePath]
 */
import { readFileSync, writeFileSync } from 'fs';
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

async function main() {
  const imagePath =
    process.argv[2] ||
    join(process.cwd(), 'test-fixtures', 'fractions-divide-page57.jpg');
  const outPath =
    process.argv[3] ||
    join(process.cwd(), 'test-fixtures', 'fractions-divide-page57-portal.json');

  const buffer = readFileSync(imagePath);
  const file = {
    buffer,
    mimetype: 'image/jpeg',
    originalname: 'page57.jpg',
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
    const grey = {
      ...file,
      buffer: variant.ocr.buffer,
      size: variant.ocr.size,
    } as Express.Multer.File;
    const color = {
      ...file,
      buffer: variant.vision.buffer,
      size: variant.vision.size,
    } as Express.Multer.File;
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
  const ruleMerged = filterPageTextForLessonAssembly(
    mergePaddleAndTesseractPageOcr(paddle, tesseract),
  );

  const checks = {
    hasDivideHeading: /Divide the following fractions/i.test(ruleMerged),
    hasMixedDivA: /1\s+2\/5\s*÷\s*4\/5/.test(ruleMerged),
    hasDivGlyph: /÷/.test(ruleMerged),
    hasSlashFrac: /\d\/\d/.test(ruleMerged),
    hasStorySums: /Real-?life Story Sums|ice cream|cupcake/i.test(ruleMerged),
    hasAItem: /\ba[.)]\s*/i.test(ruleMerged),
  };

  const out = {
    degrees: best?.degrees,
    checks,
    paddleChars: paddle.length,
    tessChars: tesseract.length,
    mergedChars: ruleMerged.length,
    paddle,
    tesseract,
    merged: ruleMerged,
  };
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ degrees: out.degrees, checks, outPath }, null, 2));
  console.log('\n===== PADDLE =====\n' + paddle);
  console.log('\n===== TESS =====\n' + tesseract);
  console.log('\n===== MERGED (portal rule) =====\n' + ruleMerged);
  await ocr.onModuleDestroy?.();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
