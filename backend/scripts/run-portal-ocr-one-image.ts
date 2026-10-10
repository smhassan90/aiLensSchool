/**
 * Same OCR path as portal chapter upload for one image:
 * orient (Tesseract) → parallel Paddle+Tesseract → coverage-aware merge → filter
 * (+ optional AI merge if keys set; OCR_AI_MERGE=0 to skip).
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  orientationCandidates,
  prepareOrientedVariant,
} from '../src/lessons/page-image-prep';
import { PageOcrService } from '../src/lessons/page-ocr.service';
import { mergePaddleAndTesseractPageOcr } from '../src/lessons/merge-paddle-tesseract-ocr';
import { intelligentMergePageOcrTranscripts } from '../src/lessons/merge-page-ocr-with-ai';
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
  const imagePath = process.argv[2];
  const subjectName = process.argv[3] || 'Physics';
  if (!imagePath) {
    console.error('Usage: ts-node run-portal-ocr-one-image.ts <imagePath> [subjectName]');
    process.exit(2);
  }

  const buffer = readFileSync(imagePath);
  const file = {
    buffer,
    mimetype: 'image/jpeg',
    originalname: 'upload.jpg',
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
      ocr.readTesseractPageTexts([grey], { subjectName }),
      ocr.readTesseractPageTexts([color], { subjectName }),
    ]);
    const text = mergeDualChannelPageOcr(g ?? '', c ?? '');
    const score = scorePageOcrCandidate(text, { englishPrimary: true });
    const readable =
      isPagePhotoTextReadable(text) && !englishPageTranscriptLooksIncomplete(text);
    const candidate: OrientationOcrCandidate = { text, score, readable, degrees: deg };
    if (compareOrientationOcrResults(best, candidate) > 0) {
      best = candidate;
      bestFile =
        text === (g ?? '') || (text !== (c ?? '') && (g ?? '').length >= (c ?? '').length)
          ? grey
          : color;
    }
  }
  if (!best || !bestFile) throw new Error('orientation failed');

  const [{ paddle, tesseract }] = await ocr.readPageOcrEnginesParallel([bestFile], {
    subjectName,
  });
  const ruleMerged = filterPageTextForLessonAssembly(
    mergePaddleAndTesseractPageOcr(paddle, tesseract),
  );
  const { merged: aiMerged, usedAi } = await intelligentMergePageOcrTranscripts({
    paddle,
    tesseract,
    orientHint: best.text,
    subjectName,
  });
  const merged = filterPageTextForLessonAssembly(aiMerged || ruleMerged);

  const out = {
    degrees: best.degrees,
    usedAi,
    paddle,
    tesseract,
    merged,
    ruleMerged,
  };
  const outPath = join(process.cwd(), 'test-fixtures', 'live-portal-ocr-one.json');
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    degrees: out.degrees,
    usedAi: out.usedAi,
    paddleChars: paddle.length,
    tesseractChars: tesseract.length,
    mergedChars: merged.length,
    outPath,
  }));
  console.log('\n===== PADDLE =====\n' + paddle);
  console.log('\n===== TESSERACT =====\n' + tesseract);
  console.log('\n===== MERGED =====\n' + merged);
  await ocr.onModuleDestroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
