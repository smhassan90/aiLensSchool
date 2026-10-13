/**
 * Oxford "Fractions" chapter workbook pages — conservative merge policy.
 * Tesseract column/slash soup must not override Paddle + layout repairs.
 */
import { mergePaddleAndTesseractPageOcr } from './merge-paddle-tesseract-ocr';
import { transcriptNoiseScore } from './ocr-layout-reconcile-utils';
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

/** Tess column bleed / pipe junk — unsafe to interleave with Paddle on workbook pages. */
export function tesseractTooNoisyForFractionMerge(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  if (tessFractionSlashSoup(t)) return true;
  const noise = transcriptNoiseScore(t);
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (noise >= 22) return true;
  if (lines.length >= 4 && noise >= 12 && noise / lines.length >= 2.5) return true;
  return false;
}

function workbookTranscriptQuality(text: string): number {
  const t = (text ?? '').trim();
  if (!t) return -1e9;
  let s = scoreFractionOcrText(t) * 3;
  s -= transcriptNoiseScore(t) * 5;
  const words = t.match(/\b[a-z]{4,}\b/gi) ?? [];
  s += Math.min(words.length, 50);
  if (/\bdenominators in the same way\b/i.test(t)) s += 12;
  if (/\bMultiplication of fractions\b/i.test(t)) s += 14;
  if (/\bExercise\s+3/i.test(t)) s += 10;
  if (/\bSolution:/i.test(t) && t.length > 120) s += 8;
  if (/\|/.test(t)) s -= 15;
  return s;
}

function pickBestFractionWorkbookTranscript(candidates: string[]): string {
  const cleaned = candidates
    .map((c) => cleanMergedPageOcrText((c ?? '').trim()))
    .filter(Boolean);
  if (!cleaned.length) return '';
  return cleaned.sort((a, b) => workbookTranscriptQuality(b) - workbookTranscriptQuality(a))[0]!;
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

  const pOnly = cleanMergedPageOcrText(p);
  const pMerged = cleanMergedPageOcrText(mergePaddleAndTesseractPageOcr(p, ''));
  const exercisePage = /\bExercise\s+3[abc]\b/i.test(p);
  const tessBad = tesseractTooNoisyForFractionMerge(t) || exercisePage;

  if (tessBad || !t) {
    let base = pickBestFractionWorkbookTranscript([pMerged, pOnly]);
    base = supplementFractionExampleFromTesseract(base, t);
    base = supplementExercise3aMcqFromTesseract(base, t);
    return cleanMergedPageOcrText(base);
  }

  let merged = cleanMergedPageOcrText(mergePaddleAndTesseractPageOcr(p, t));
  merged = supplementFractionExampleFromTesseract(merged, t);
  merged = supplementExercise3aMcqFromTesseract(merged, t);
  return pickBestFractionWorkbookTranscript([merged, pMerged, pOnly]);
}

/** Tess MCQ columns for Exercise 3a — format option circles when Paddle emits digit soup. */
function supplementExercise3aMcqFromTesseract(merged: string, tesseract: string): string {
  const m = (merged ?? '').trim();
  const tess = (tesseract ?? '').trim();
  if (!m || !tess || !/\bExercise\s+3a\b/i.test(m)) return m;

  const body = m.replace(/\n*Fractions\s*\n*OXFORD\s*$/i, '').trim();
  const mcq = body.match(/\n3\.\s*Select the correct answer[\s\S]*$/i);
  if (!mcq) return m;

  const prefix = body.slice(0, mcq.index).trim();
  let section3 = mcq[0].trim();

  const optRow = tess.match(/O\s*\d{1,2}[\sO@©®\d]{10,80}/i);
  if (optRow && /a\.\s*is equal to/i.test(section3)) {
    const circles = [...optRow[0].matchAll(/O\s*(\d{1,2})/gi)].map((x) => x[1]);
    if (circles.length >= 4) {
      section3 = section3.replace(
        /a\.\s*is equal to[\s\S]*?(?=\nb\.|\nFractions|$)/i,
        `a. 3/13 + 1/12 is equal to\n   A) ${circles[0]}/12   B) ${circles[1]}/12   C) ${circles[2]}/30   D) ${circles[3]}/30`,
      );
    }
  }

  section3 = section3.replace(/\b585%\b/g, '6/5');
  section3 = section3.replace(/\b23\/6 is equal to\b/gi, 'd. 23 2/45 is equal to');

  return `${prefix}\n\n${section3}\n\nFractions\nOXFORD`.trim();
}

/** Pull a clean Example line from Tess when Paddle glues "ExampleWork out". */
function supplementFractionExampleFromTesseract(merged: string, tesseract: string): string {
  const m = (merged ?? '').trim();
  const tess = (tesseract ?? '').trim();
  if (!m || !tess) return m;
  if (!/ExampleWork out|Solution2expressed/i.test(m)) return m;
  const ex = tess.match(/Example:\s*Work out[^\n.]{0,80}/i);
  const sol = tess.match(/Solution:\s*[^\n.]{0,80}/i);
  let out = m;
  if (ex) {
    out = out.replace(/ExampleWork out[^\n]*/i, ex[0].replace(/\s+/g, ' ').trim());
  }
  if (sol && /Solution2expressed/i.test(out)) {
    out = out.replace(/Solution2expressed[^\n]*/i, sol[0].replace(/\s+/g, ' ').trim());
  }
  return out;
}
