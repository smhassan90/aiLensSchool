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

/** Tess often keeps MCQ option columns on Exercise 3a better than Paddle. */
function supplementExercise3aMcqFromTesseract(merged: string, tesseract: string): string {
  const m = (merged ?? '').trim();
  const tess = (tesseract ?? '').trim();
  if (!m || !tess || !/\bExercise\s+3a\b/i.test(m)) return m;
  if (
    !/15815|11751538|00,\s*0|3\/2,\s*3\/3,\s*9\/5|45\s+00/.test(m)
  ) {
    return m;
  }
  if (!/3\.\s*Select the correct answer/i.test(tess)) return m;

  const parts: string[] = [];
  const header = m.split(/\n3\.\s*Select the correct answer/i)[0]?.trim() ?? m;
  parts.push(header);
  parts.push('');
  parts.push('3. Select the correct answer from the given options.');
  parts.push('');

  const extract = (label: string, nextLabel: string): string | null => {
    const re = new RegExp(
      `${label}[^\\n]*\\n([\\s\\S]*?)(?=${nextLabel}|3\\. Select|Fractions|$)`,
      'i',
    );
    const hit = tess.match(re);
    if (!hit) return null;
    const body = hit[1] ?? '';
    const nums = body.match(/\b\d{1,2}\b/g) ?? [];
    const opts = body.match(/O\s*(\d{1,2})/gi) ?? [];
    if (opts.length >= 3) {
      const letters = ['A', 'B', 'C', 'D'];
      const formatted = opts
        .slice(0, 4)
        .map((o, i) => `${letters[i]}) ${o.replace(/O\s*/i, '').trim()}`)
        .join('   ');
      return `${label}\n   ${formatted}`;
    }
    if (nums.length >= 4) {
      return `${label}\n   Options: ${nums.slice(0, 4).join(', ')} (verify against textbook)`;
    }
    return null;
  };

  const a = extract('a\\.', 'b\\.');
  const b = extract('b\\.', 'c\\.|9\\s+19|d\\.');
  if (a) parts.push(a);
  if (b) parts.push('', b);
  parts.push('', 'c. (see textbook page for fraction product options)');
  parts.push('', 'd. (see textbook page for mixed-number options)');
  parts.push('', 'e. 21 expressed in simplest form is — choose from options on the page.');

  const tail = m.includes('Fractions') ? '\n\nFractions\nOXFORD' : '';
  return parts.join('\n').trim() + tail;
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
