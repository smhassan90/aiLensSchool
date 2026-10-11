/**
 * End-to-end fractions chapter OCR — same orchestration as LessonsService chapter upload:
 *   prepareOrientedVariant(0) → readPageOcrEnginesParallel → legacy merge → rule merge → finalize (AI off for math).
 *
 * Usage (from backend/):
 *   $env:OCR_AI_MERGE='0'
 *   npx tsx scripts/fractions-chapter-e2e-portal.ts [--page=p39-reduce] [--limit=N]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { prepareOrientedVariant } from '../src/lessons/page-image-prep';
import { PageOcrService, ocrLanguagesForSubject } from '../src/lessons/page-ocr.service';
import { mergePaddleAndTesseractPageOcr } from '../src/lessons/merge-paddle-tesseract-ocr';
import { mergePageOcr, reconcilePageOcr } from '../src/lessons/ocr-layout-reconcile';
import { intelligentMergePageOcrTranscripts } from '../src/lessons/merge-page-ocr-with-ai';
import { looksLikeGarbledLatinOcr } from '../src/common/garbled-latin-ocr';
import {
  filterPageTextForLessonAssembly,
  pickBetterPageTranscript,
  preferEnglishLessonPageTranscript,
  looksLikePoemOrReadingPage,
  englishPageTranscriptLooksIncomplete,
} from '../src/lessons/page-text-sanitize';

const SUBJECT = { name: 'Mathematics' };

function assemblyFilterOptions() {
  return { keepArabicScript: ocrLanguagesForSubject(SUBJECT.name) !== 'eng' };
}

function ruleMergeChapterPageOcr(
  paddle: string,
  tesseract: string,
  orientOcrText: string,
  paddleLines?: import('../src/lessons/ocr-structured-line').OcrStructuredLine[],
  tesseractLines?: import('../src/lessons/ocr-structured-line').OcrStructuredLine[],
) {
  const filterOpts = assemblyFilterOptions();
  const legacyRaw = mergePaddleAndTesseractPageOcr(paddle, tesseract);
  const layoutRaw = mergePageOcr({
    paddle,
    tesseract,
    paddleLines,
    tesseractLines,
    subjectName: SUBJECT.name,
  });
  const reconcileMeta = reconcilePageOcr({
    paddle,
    tesseract,
    paddleLines,
    tesseractLines,
    subjectName: SUBJECT.name,
  });
  const mergedRaw = layoutRaw;
  let merged = filterPageTextForLessonAssembly(mergedRaw, filterOpts);
  if (looksLikeGarbledLatinOcr(merged)) {
    const paddleClean = (paddle ?? '').trim();
    const tessClean = (tesseract ?? '').trim();
    const fallback = pickBetterPageTranscript(
      looksLikeGarbledLatinOcr(paddleClean) ? '' : paddleClean,
      looksLikeGarbledLatinOcr(tessClean) ? '' : tessClean,
    );
    if (fallback.trim()) merged = filterPageTextForLessonAssembly(fallback, filterOpts);
  }
  const englishPrimary = ocrLanguagesForSubject(SUBJECT.name) === 'eng';
  const orientHint = looksLikeGarbledLatinOcr(orientOcrText) ? '' : (orientOcrText ?? '').trim();
  const lessonSource = englishPrimary
    ? preferEnglishLessonPageTranscript(merged, orientHint)
    : pickBetterPageTranscript(merged, orientHint);
  const text = filterPageTextForLessonAssembly(lessonSource, filterOpts);
  return {
    legacyMerged: filterPageTextForLessonAssembly(legacyRaw, filterOpts),
    ruleMerged: merged,
    ruleOcrText: text.trim() || merged,
    usedLayoutReconcile: reconcileMeta.usedLayoutReconcile,
  };
}

async function finalizeChapterPageOcrMerge(
  paddle: string,
  tesseract: string,
  orientOcrText: string,
  paddleLines?: import('../src/lessons/ocr-structured-line').OcrStructuredLine[],
  tesseractLines?: import('../src/lessons/ocr-structured-line').OcrStructuredLine[],
) {
  const filterOpts = assemblyFilterOptions();
  const rule = ruleMergeChapterPageOcr(paddle, tesseract, orientOcrText, paddleLines, tesseractLines);
  const englishPrimary = ocrLanguagesForSubject(SUBJECT.name) === 'eng';
  const wantsAiFill =
    englishPrimary &&
    (looksLikePoemOrReadingPage(paddle) ||
      looksLikePoemOrReadingPage(tesseract) ||
      looksLikePoemOrReadingPage(rule.ruleMerged) ||
      englishPageTranscriptLooksIncomplete(rule.ruleMerged) ||
      englishPageTranscriptLooksIncomplete(rule.ruleOcrText));
  const skipAi = process.env.OCR_AI_MERGE === '0' || !wantsAiFill;
  const { merged: aiMerged, usedAi } = await intelligentMergePageOcrTranscripts({
    paddle,
    tesseract,
    orientHint: looksLikeGarbledLatinOcr(orientOcrText) ? '' : orientOcrText,
    subjectName: SUBJECT.name,
    skipAi,
    ruleMerged: rule.ruleMerged,
  });
  const mergedDraft = usedAi && aiMerged?.trim() ? aiMerged : rule.ruleMerged;
  let merged = filterPageTextForLessonAssembly(mergedDraft, filterOpts);
  if (!merged.trim()) merged = rule.ruleMerged;
  const orientHint = looksLikeGarbledLatinOcr(orientOcrText) ? '' : (orientOcrText ?? '').trim();
  const lessonSource = englishPrimary
    ? preferEnglishLessonPageTranscript(merged, orientHint)
    : pickBetterPageTranscript(merged, orientHint);
  const text = filterPageTextForLessonAssembly(lessonSource, filterOpts);
  return {
    ...rule,
    finalMerged: merged,
    finalOcrText: text.trim() || merged,
    usedAi,
    wantsAiFill,
  };
}

async function processPage(imagePath: string, pageId: string, bookPage: number | null) {
  const buffer = readFileSync(imagePath);
  const file = {
    buffer,
    mimetype: 'image/jpeg',
    originalname: `${pageId}.jpg`,
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

  const ocr = new PageOcrService();
  const t0 = Date.now();
  const [{ paddle, tesseract, paddleLines, tesseractLines }] =
    await ocr.readPageOcrEnginesParallel([ocrFile], { subjectName: SUBJECT.name });
  const engineMs = Date.now() - t0;

  const finalized = await finalizeChapterPageOcrMerge(
    paddle,
    tesseract,
    '',
    paddleLines,
    tesseractLines,
  );
  await ocr.onModuleDestroy?.();

  const introDupes = (s: string) => (s.match(/\bNow we will deal with/gi) ?? []).length;
  const glued = (s: string) => /\badditionsubtraction/i.test(s);

  return {
    pageId,
    bookPage,
    image: imagePath,
    env: {
      OCR_ENGINE: process.env.OCR_ENGINE ?? '(default)',
      OCR_AI_MERGE: process.env.OCR_AI_MERGE ?? '(default)',
    },
    orientation: { degrees: 0, prep: 'prepareOrientedVariant(0) — portal upload path' },
    engineMs,
    paddle,
    tesseract,
    legacyMerged: finalized.legacyMerged,
    layoutRuleMerged: finalized.ruleMerged,
    usedLayoutReconcile: finalized.usedLayoutReconcile,
    finalMergedOcrText: finalized.finalMerged,
    finalOcrText: finalized.finalOcrText,
    usedAi: finalized.usedAi,
    persistedLessonSource: {
      paddleOcrText: paddle.trim() || null,
      tesseractOcrText: tesseract.trim() || null,
      mergedOcrText: finalized.finalMerged.trim() || null,
      ocrText: finalized.finalOcrText.trim() || null,
    },
    signals: {
      introDuplicateCount: introDupes(finalized.finalOcrText),
      gluedAdditionSubtraction: glued(finalized.finalOcrText),
      paddleIntroDupes: introDupes(paddle),
    },
  };
}

async function main() {
  const root = join(process.cwd(), 'test-fixtures', 'fractions-chapter-calibration');
  const dataset = JSON.parse(readFileSync(join(root, 'chapter_dataset.json'), 'utf-8')) as {
    pages: Array<{ id: string; bookPage: number | null; image: string }>;
  };
  const onlyPage = process.argv.find((a) => a.startsWith('--page='))?.slice(7);
  const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.slice(8) ?? '0');
  let pages = dataset.pages;
  if (onlyPage) pages = pages.filter((p) => p.id === onlyPage);
  if (limit > 0) pages = pages.slice(0, limit);

  const outDir = join(root, 'e2e-portal-reports');
  mkdirSync(outDir, { recursive: true });

  const summary: Array<Record<string, unknown>> = [];

  for (const page of pages) {
    const imagePath = join(root, page.image);
    if (!existsSync(imagePath)) {
      console.warn(`Skip ${page.id}: missing ${page.image}`);
      continue;
    }
    console.log(`\n=== E2E ${page.id} (${page.image}) ===`);
    const report = await processPage(imagePath, page.id, page.bookPage);
    const outPath = join(outDir, `${page.id}.json`);
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(
      `engines ${report.engineMs}ms | layout=${report.usedLayoutReconcile} | ocrText len=${report.finalOcrText.length} | introDupes=${report.signals.introDuplicateCount}`,
    );
    summary.push({
      pageId: page.id,
      bookPage: page.bookPage,
      introDupes: report.signals.introDuplicateCount,
      glued: report.signals.gluedAdditionSubtraction,
      reportPath: outPath,
    });
  }

  writeFileSync(join(outDir, '_summary.json'), JSON.stringify({ generatedAt: new Date().toISOString(), summary }, null, 2));
  console.log(`\nWrote ${outDir}/_summary.json (${summary.length} pages)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
