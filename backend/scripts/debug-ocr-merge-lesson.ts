/**
 * Run Paddle + Tesseract + merge on textbook page fixtures; print lesson body (no exercises).
 * Usage: npx ts-node --transpile-only scripts/debug-ocr-merge-lesson.ts [fixture-dir] [max-pages]
 */
import { config } from 'dotenv';
config();
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PageOcrService } from '../src/lessons/page-ocr.service';
import {
  assembleChapterLessonFromPageTexts,
  intelligentMergePageOcrTranscripts,
} from '../src/lessons/merge-page-ocr-with-ai';
import {
  compareOrientationOcrResults,
  mergeDualChannelPageOcr,
  scorePageOcrCandidate,
  isPagePhotoTextReadable,
  englishPageTranscriptLooksIncomplete,
} from '../src/lessons/page-text-sanitize';
import { orientationCandidates, prepareOrientedVariant } from '../src/lessons/page-image-prep';

async function getSharp() {
  const m = await import('sharp');
  return (m as { default?: (i: Buffer) => import('sharp').Sharp }).default ?? m;
}

async function bestOrientedFile(
  ocr: PageOcrService,
  buffer: Buffer,
): Promise<{ ocrFile: Express.Multer.File; degrees: number; orientMerged: string }> {
  const file = {
    buffer,
    mimetype: 'image/jpeg',
    originalname: 'page.jpg',
    size: buffer.length,
  } as Express.Multer.File;
  const sharpFn = await getSharp();
  const afterExif = await sharpFn(buffer).rotate().toBuffer({ resolveWithObject: true });
  const degreesList = orientationCandidates(afterExif.info.width, afterExif.info.height);
  let best: { ocrFile: Express.Multer.File; degrees: number; text: string } | null = null;
  for (const degrees of degreesList) {
    const variant = await prepareOrientedVariant(file, degrees);
    const grey = {
      ...file,
      buffer: variant.ocr.buffer,
      mimetype: 'image/jpeg',
      size: variant.ocr.size,
    } as Express.Multer.File;
    const color = {
      ...file,
      buffer: variant.vision.buffer,
      mimetype: 'image/jpeg',
      size: variant.vision.size,
    } as Express.Multer.File;
    const [[g], [c]] = await Promise.all([
      ocr.readPageTexts([grey], { subjectName: 'English' }),
      ocr.readPageTexts([color], { subjectName: 'English' }),
    ]);
    const text = mergeDualChannelPageOcr((g ?? '').trim(), (c ?? '').trim());
    const score = scorePageOcrCandidate(text, { englishPrimary: true });
    const readable =
      isPagePhotoTextReadable(text) && !englishPageTranscriptLooksIncomplete(text);
    const candidate = { text, degrees, score, readable };
    if (compareOrientationOcrResults(best ?? undefined, candidate) > 0) {
      best = {
        ocrFile: grey,
        degrees,
        text,
      };
    }
  }
  if (!best) throw new Error('orientation failed');
  return { ocrFile: best.ocrFile, degrees: best.degrees, orientMerged: best.text };
}

async function main() {
  const dir =
    process.argv[2] ?? join(__dirname, '../test-fixtures/dignity-of-work');
  const maxPages = Number(process.argv[3] ?? '3');
  process.env.OCR_ENGINE = process.env.OCR_ENGINE ?? 'auto';

  const files = readdirSync(dir)
    .filter((f) => /^\d+\.jpg$/i.test(f))
    .sort()
    .slice(0, maxPages);

  const ocr = new PageOcrService();
  const pageBlocks: string[] = [];
  let totalMs = 0;

  for (const name of files) {
    const path = join(dir, name);
    const buffer = readFileSync(path);
    const t0 = Date.now();
    const { ocrFile, degrees, orientMerged } = await bestOrientedFile(ocr, buffer);
    const [{ paddle, tesseract }] = await ocr.readPageOcrEnginesParallel([ocrFile], {
      subjectName: 'English',
    });
    const { merged, usedAi } = await intelligentMergePageOcrTranscripts({
      paddle,
      tesseract,
      orientHint: orientMerged,
      subjectName: 'English',
    });
    const ms = Date.now() - t0;
    totalMs += ms;
    pageBlocks.push(merged);
    console.log(`\n=== ${name} (${degrees}°, ${ms}ms, ai=${usedAi}) ===`);
    console.log(`paddle ${paddle.length}ch | tess ${tesseract.length}ch | merged ${merged.length}ch`);
    console.log(merged.slice(0, 500) + (merged.length > 500 ? '…' : ''));
  }

  const chapter = assembleChapterLessonFromPageTexts(pageBlocks);
  const outPath = join(dir, 'merged-lesson-debug.txt');
  writeFileSync(outPath, chapter, 'utf8');
  console.log(`\n--- Chapter lesson (${files.length} pages, ${totalMs}ms total) ---\n`);
  console.log(chapter);
  console.log(`\nWrote ${outPath}`);
  await ocr.onModuleDestroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
