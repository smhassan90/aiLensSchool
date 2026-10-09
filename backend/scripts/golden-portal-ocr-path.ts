/**
 * Golden verification for Dignity of Work — same merge path as portal upload:
 *   orient (Tesseract grey+color) → parallel engines → mergePaddleAndTesseractPageOcr
 *   → filterPageTextForLessonAssembly → optional intelligentMergePageOcrTranscripts
 *
 * Does NOT invent success from worker-only Paddle CLI output.
 *
 * Usage (from backend/):
 *   npx ts-node --transpile-only scripts/golden-portal-ocr-path.ts
 *   OCR_AI_MERGE=0 npx ts-node --transpile-only scripts/golden-portal-ocr-path.ts
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs';
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

const EXPECTED: Record<string, RegExp[]> = {
  '01': [
    // OCR often mangling "Pre-reading" → preseadic / pre reading
    /pre[\s-]*reading|presead/i,
    /Dignity of Work/i,
    /Akhtar came home/i,
    /social\s*service/i,
    /feeling cross|was feeling|feeling\s*CLOSS/i,
  ],
  '02': [/sweeper not a human/i, /Holy Prophet/i, /Khandaq|Khandag/i],
  '03': [/Chin/i, /newspaper|deliver/i, /motto|inspir/i],
};

async function pickOrientLikePortal(
  ocr: PageOcrService,
  file: Express.Multer.File,
): Promise<{ text: string; deg: number; ocrFile: Express.Multer.File }> {
  const sharpModule = await import('sharp');
  const sharpFn =
    (sharpModule as { default?: (i: Buffer) => import('sharp').Sharp }).default ??
    (sharpModule as unknown as (i: Buffer) => import('sharp').Sharp);
  const afterExif = await sharpFn(file.buffer).rotate().toBuffer({ resolveWithObject: true });
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
      ocr.readTesseractPageTexts([grey], { subjectName: 'English' }),
      ocr.readTesseractPageTexts([color], { subjectName: 'English' }),
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
  if (!best || !bestFile) throw new Error('no orientation');
  return { text: best.text, deg: best.degrees, ocrFile: bestFile };
}

/** Same rule + optional AI merge steps as LessonsService.finalizeChapterPageOcrMerge (without vision). */
async function portalLikeMerge(
  paddle: string,
  tesseract: string,
  orientHint: string,
): Promise<{ ruleMerged: string; final: string; usedAi: boolean }> {
  const ruleRaw = mergePaddleAndTesseractPageOcr(paddle, tesseract);
  const ruleMerged = filterPageTextForLessonAssembly(ruleRaw);
  const { merged, usedAi } = await intelligentMergePageOcrTranscripts({
    paddle,
    tesseract,
    orientHint,
    subjectName: 'English',
    // Default: AI on when keys exist (same as portal). Set OCR_AI_MERGE=0 for rule-only.
  });
  const final = filterPageTextForLessonAssembly(merged || ruleMerged);
  return { ruleMerged, final, usedAi };
}

async function main() {
  const dir = join(__dirname, '../test-fixtures/dignity-of-work');
  const files = readdirSync(dir)
    .filter((f) => /^0[123]\.jpg$/i.test(f))
    .sort();
  if (files.length < 3) {
    console.error('Need dignity-of-work/01.jpg..03.jpg fixtures');
    process.exit(2);
  }

  const ocr = new PageOcrService();
  const report: string[] = [];
  let failures = 0;

  console.log(`OCR_ENGINE=${process.env.OCR_ENGINE ?? 'auto'} OCR_AI_MERGE=${process.env.OCR_AI_MERGE ?? '(default)'}`);

  for (const name of files) {
    const key = name.replace(/\.jpg$/i, '');
    const buffer = readFileSync(join(dir, name));
    const file = {
      buffer,
      mimetype: 'image/jpeg',
      originalname: name,
      size: buffer.length,
    } as Express.Multer.File;

    const orient = await pickOrientLikePortal(ocr, file);
    const [{ paddle, tesseract }] = await ocr.readPageOcrEnginesParallel([orient.ocrFile], {
      subjectName: 'English',
    });
    const { ruleMerged, final, usedAi } = await portalLikeMerge(
      paddle,
      tesseract,
      orient.text,
    );

    const cues = EXPECTED[key] ?? [];
    const miss = cues.filter((re) => !re.test(final));
    failures += miss.length;

    const line = [
      `${name}: deg=${orient.deg}`,
      `paddle=${paddle.length}`,
      `tess=${tesseract.length}`,
      `rule=${ruleMerged.length}`,
      `final=${final.length}`,
      `usedAi=${usedAi}`,
      `cues ${cues.length - miss.length}/${cues.length}`,
      miss.length ? `MISSING=[${miss.map((r) => r.source).join('; ')}]` : 'OK',
    ].join(' | ');
    console.log(line);
    report.push(
      `\n===== ${name} =====\n${line}\n\nPADDLE:\n${paddle.slice(0, 600)}\n\nTESSERACT:\n${tesseract.slice(0, 600)}\n\nRULE MERGED:\n${ruleMerged.slice(0, 800)}\n\nFINAL (portal-like):\n${final.slice(0, 1200)}\n`,
    );
  }

  const out = join(dir, 'golden-portal-path.txt');
  writeFileSync(out, report.join('\n'));
  console.log(`\nWrote ${out}`);
  console.log(failures === 0 ? 'GOLDEN PASS' : `GOLDEN FAIL missingCues=${failures}`);
  await ocr.onModuleDestroy();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
