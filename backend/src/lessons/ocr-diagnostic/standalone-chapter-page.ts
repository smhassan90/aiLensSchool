/**
 * Diagnostic chapter-page OCR without Nest DI — mirrors LessonsService.runDiagnosticChapterPageOcr.
 */
import { prepareOrientedVariant } from '../page-image-prep';
import { PageOcrService, ocrLanguagesForSubject } from '../page-ocr.service';
import { mergePageOcr } from '../ocr-layout-reconcile';
import { applyMathRegionRecovery, mathRegionRecoveryEnabled } from '../ocr-math-region-recovery';
import { applyPix2TextMathCropFusion } from '../ocr-pix2text-math-fusion';
import { intelligentMergePageOcrTranscripts } from '../merge-page-ocr-with-ai';
import { looksLikeGarbledLatinOcr } from '../../common/garbled-latin-ocr';
import {
  filterPageTextForLessonAssembly,
  pickBetterPageTranscript,
  preferEnglishLessonPageTranscript,
  looksLikePoemOrReadingPage,
  englishPageTranscriptLooksIncomplete,
} from '../page-text-sanitize';
import { readEnv } from '../../common/env';
import {
  beginOcrDiagnosticSession,
  endOcrDiagnosticSession,
  recordImageBoundary,
  recordOcrDiagnosticEvent,
  recordTextBoundary,
  runWithOcrDiagnosticSession,
  getOcrDiagnosticSession,
} from './index';

async function pageDimensions(buf: Buffer): Promise<{ width: number; height: number }> {
  const sharpModule = await import('sharp');
  const sharp =
    (sharpModule as { default?: (i: Buffer) => import('sharp').Sharp }).default ??
    (sharpModule as unknown as (i: Buffer) => import('sharp').Sharp);
  const meta = await sharp(buf).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

function ruleMerge(
  paddle: string,
  tesseract: string,
  orientOcrText: string,
  subjectName: string,
  paddleLines?: import('../ocr-structured-line').OcrStructuredLine[],
  tesseractLines?: import('../ocr-structured-line').OcrStructuredLine[],
) {
  const subject = { name: subjectName };
  const filterOpts = {
    keepArabicScript: ocrLanguagesForSubject(subject.name) !== 'eng',
  };
  const mergedRaw = mergePageOcr({
    paddle,
    tesseract,
    paddleLines,
    tesseractLines,
    subjectName,
  });
  let merged = filterPageTextForLessonAssembly(mergedRaw, filterOpts);
  if (looksLikeGarbledLatinOcr(merged)) {
    const fallback = pickBetterPageTranscript(
      looksLikeGarbledLatinOcr(paddle) ? '' : paddle.trim(),
      looksLikeGarbledLatinOcr(tesseract) ? '' : tesseract.trim(),
    );
    if (fallback.trim()) merged = filterPageTextForLessonAssembly(fallback, filterOpts);
  }
  const englishPrimary = ocrLanguagesForSubject(subject.name) === 'eng';
  const orientHint = looksLikeGarbledLatinOcr(orientOcrText) ? '' : orientOcrText.trim();
  const lessonSource = englishPrimary
    ? preferEnglishLessonPageTranscript(merged, orientHint)
    : pickBetterPageTranscript(merged, orientHint);
  const text = filterPageTextForLessonAssembly(lessonSource, filterOpts);
  return { text, merged };
}

async function finalizeLikePortal(
  paddle: string,
  tesseract: string,
  orientOcrText: string,
  subjectName: string,
  pageImageBuffer: Buffer,
  paddleLines?: import('../ocr-structured-line').OcrStructuredLine[],
  tesseractLines?: import('../ocr-structured-line').OcrStructuredLine[],
): Promise<{ text: string; merged: string }> {
  const filterOpts = {
    keepArabicScript: ocrLanguagesForSubject(subjectName) !== 'eng',
  };
  const rule = ruleMerge(paddle, tesseract, orientOcrText, subjectName, paddleLines, tesseractLines);
  let ruleMerged = rule.merged;
  let ruleOcrText = rule.text;
  recordTextBoundary(getOcrDiagnosticSession(), 'rule_merge_merged', ruleMerged);
  const dim = await pageDimensions(pageImageBuffer);
  if (mathRegionRecoveryEnabled()) {
    recordOcrDiagnosticEvent({ stage: 'branch_math_region_recovery', branchEntered: true });
    const recovered = await applyMathRegionRecovery({
      imageBuffer: pageImageBuffer,
      imageWidth: dim.width,
      imageHeight: dim.height,
      baseTranscript: ruleMerged,
      paddleLines,
      tesseractLines,
      subjectName,
    });
    if (recovered.text.trim() && recovered.appliedRegions.length) {
      ruleMerged = filterPageTextForLessonAssembly(recovered.text, filterOpts);
      ruleOcrText = filterPageTextForLessonAssembly(
        pickBetterPageTranscript(ruleMerged, rule.text),
        filterOpts,
      );
    }
  }
  if (readEnv('OCR_PIX2TEXT_MATH_CROPS') === '1') {
    recordOcrDiagnosticEvent({ stage: 'branch_pix2text_math_crops', branchEntered: true });
    const pixFused = await applyPix2TextMathCropFusion({
      imageBuffer: pageImageBuffer,
      imageWidth: dim.width,
      imageHeight: dim.height,
      baseTranscript: ruleMerged,
      paddleLines,
      tesseractLines,
      subjectName,
    });
    if (pixFused.appliedRegions.length && pixFused.text.trim()) {
      ruleMerged = filterPageTextForLessonAssembly(pixFused.text, filterOpts);
      ruleOcrText = filterPageTextForLessonAssembly(
        pickBetterPageTranscript(ruleMerged, rule.text),
        filterOpts,
      );
      recordOcrDiagnosticEvent({
        stage: 'pix2text_fusion_applied',
        fusionDecision: 'accept',
        extra: { appliedRegions: pixFused.appliedRegions },
      });
    } else {
      recordOcrDiagnosticEvent({
        stage: 'pix2text_fusion_skipped',
        fusionDecision: 'reject',
        extra: { skippedReason: pixFused.skippedReason },
      });
    }
  }
  const englishPrimary = ocrLanguagesForSubject(subjectName) === 'eng';
  const wantsAiFill =
    englishPrimary &&
    (looksLikePoemOrReadingPage(paddle) ||
      looksLikePoemOrReadingPage(tesseract) ||
      looksLikePoemOrReadingPage(ruleMerged) ||
      englishPageTranscriptLooksIncomplete(ruleMerged));
  const skipAi = readEnv('OCR_AI_MERGE') === '0' || !wantsAiFill;
  const { merged: aiMerged, usedAi } = await intelligentMergePageOcrTranscripts({
    paddle,
    tesseract,
    orientHint: looksLikeGarbledLatinOcr(orientOcrText) ? '' : orientOcrText,
    subjectName,
    skipAi,
    ruleMerged,
  });
  let merged = filterPageTextForLessonAssembly(
    usedAi && aiMerged?.trim() ? aiMerged : ruleMerged,
    filterOpts,
  );
  const text = filterPageTextForLessonAssembly(
    englishPrimary
      ? preferEnglishLessonPageTranscript(merged, orientOcrText)
      : pickBetterPageTranscript(merged, orientOcrText),
    filterOpts,
  );
  recordOcrDiagnosticEvent({ stage: 'finalize_complete', extra: { usedAi, skipAi } });
  return { text: text || merged, merged };
}

export async function runStandaloneDiagnosticChapterPage(input: {
  file: Express.Multer.File;
  subjectName: string;
  correlationId?: string;
  testCaseId?: string;
}): Promise<{
  manifestPath: string | null;
  correlationId: string;
  paddle: string;
  tesseract: string;
  ocrText: string;
  mergedOcrText: string;
}> {
  const session = beginOcrDiagnosticSession({
    correlationId: input.correlationId,
    testCaseId: input.testCaseId,
  });
  if (!session) {
    throw new Error('OCR_DIAGNOSTIC=1 required');
  }
  const ocr = new PageOcrService();
  return runWithOcrDiagnosticSession(session, async () => {
    await recordImageBoundary(session, 'backend_received_upload', input.file.buffer);
    const variant = await prepareOrientedVariant(input.file, 0);
    const ocrFile = {
      ...input.file,
      buffer: variant.ocr.buffer,
      mimetype: variant.ocr.mimeType,
      size: variant.ocr.size,
    } as Express.Multer.File;
    await recordImageBoundary(session, 'orient_ocr_file', ocrFile.buffer);
    const [{ paddle, tesseract, paddleLines, tesseractLines }] =
      await ocr.readPageOcrEnginesParallel([ocrFile], { subjectName: input.subjectName });
    recordTextBoundary(session, 'paddle_raw', paddle, 'paddle');
    recordTextBoundary(session, 'tesseract_raw', tesseract, 'tesseract');
    const { text, merged } = await finalizeLikePortal(
      paddle,
      tesseract,
      '',
      input.subjectName,
      ocrFile.buffer,
      paddleLines,
      tesseractLines,
    );
    recordTextBoundary(session, 'finalize_ocr_text', text);
    recordTextBoundary(session, 'finalize_merged_ocr_text', merged);
    const manifestPath = endOcrDiagnosticSession(session);
    await ocr.onModuleDestroy?.();
    return {
      manifestPath,
      correlationId: session.correlationId,
      paddle,
      tesseract,
      ocrText: text,
      mergedOcrText: merged,
    };
  });
}
