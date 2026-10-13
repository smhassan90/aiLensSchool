/**
 * Oxford "Fractions" chapter workbook pages — conservative merge policy.
 * Tesseract column/slash soup must not override Paddle + layout repairs.
 */
import { mergePaddleAndTesseractPageOcr } from './merge-paddle-tesseract-ocr';
import { scoreFractionOcrText } from './ocr-math-region-recovery';
import { cleanMergedPageOcrText } from './science-ocr-clean';

const FRACTIONS_CHAPTER_CUE =
  /\b(?:Fractions|OXFORD|Reduce\s+\d|Exercise\s+3[abc]|Real[- ]?life\s+Story\s+Sums|Multiplication of fractions|Addition and subtraction of two or more fractions|Divide the following fractions)\b/i;

/** Tess often emits comma-separated absurd slashes on reduce pages. */
export function tessFractionSlashSoup(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  if (/\b\d{1,2}\/\d{2},\s*\d{1,2}\/\d{1,2},\s*\d{1,2}\/\d{2}/.test(t)) return true;
  if (/\bReduce\s+2\s+to the lowest term\b/i.test(t) && !/\b28\/40\b|\b28÷/.test(t)) return true;
  if (/\bSolution:\s*402\b/i.test(t) && /\b40\/202\b/.test(t)) return true;
  if ((t.match(/\b\d{1,2}\/\d{1,2}\b/g) ?? []).length >= 4 && !/\d+÷\d+/.test(t)) {
    const absurd = [...t.matchAll(/\b(\d{1,3})\/(\d{1,3})\b/g)].filter(
      (m) => Number(m[1]) >= 20 || Number(m[2]) <= 2,
    );
    if (absurd.length >= 3) return true;
  }
  return false;
}

export function isOxfordFractionsWorkbookPage(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  if (/\bReduce\s+\d{2}/i.test(t) && /\d+÷\d+/.test(t)) return true;
  if (!FRACTIONS_CHAPTER_CUE.test(t)) return false;
  return (
    /\bfractions\b/i.test(t) ||
    /\blowest term\b/i.test(t) ||
    /\bExercise\s+3/i.test(t) ||
    /\bMultiplication of a fraction\b/i.test(t)
  );
}

/** Orientation / Tess hint must not replace a repaired fraction merge. */
export function shouldSkipOrientHintLessonBlend(
  merged: string,
  orientHint: string,
  paddle: string,
): boolean {
  if (!isOxfordFractionsWorkbookPage(`${merged}\n${paddle}`)) return false;
  const m = (merged ?? '').trim();
  const o = (orientHint ?? '').trim();
  const p = (paddle ?? '').trim();
  if (!o) return false;
  if (tessFractionSlashSoup(o)) return true;
  if (/\d+÷\d+/.test(m) && tessFractionSlashSoup(o)) return true;
  if (/\bReduce\s+28\/40\b/i.test(m) && /\bReduce\s+2\s+to the lowest/i.test(o)) return true;
  if (scoreFractionOcrText(m) > scoreFractionOcrText(o) + 8) return true;
  if (scoreFractionOcrText(m) >= scoreFractionOcrText(p) && tessFractionSlashSoup(o)) return true;
  return false;
}

/** Skip Pix2Text / math-cell on workbook pages unless this is a divide-grid exercise. */
export function skipExperimentalMathFusionOnFractionsWorkbook(transcript: string): boolean {
  if (!isOxfordFractionsWorkbookPage(transcript)) return false;
  return !/\bdivide\s+the\s+following\s+fractions\b/i.test(transcript);
}

export function mergeOxfordFractionsWorkbookPageOcr(paddle: string, tesseract: string): string {
  const p = (paddle ?? '').trim();
  const t = (tesseract ?? '').trim();
  if (!p && !t) return '';

  let merged = mergePaddleAndTesseractPageOcr(p, t);
  const pOnly = cleanMergedPageOcrText(p);
  const pMerged = cleanMergedPageOcrText(mergePaddleAndTesseractPageOcr(p, ''));
  const mClean = cleanMergedPageOcrText(merged);

  const tessBad = tessFractionSlashSoup(t);
  if (tessBad) {
    const paddleBase = scoreFractionOcrText(pMerged) >= scoreFractionOcrText(pOnly) ? pMerged : pOnly;
    return cleanMergedPageOcrText(paddleBase);
  }

  if (tessFractionSlashSoup(mClean) && scoreFractionOcrText(pMerged) >= scoreFractionOcrText(mClean)) {
    return cleanMergedPageOcrText(pMerged);
  }

  return mClean;
}
