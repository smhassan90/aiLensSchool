import { countLatinLetters } from '../common/extract-quality';
import { latinOcrWordLooksPlausible } from '../common/garbled-latin-ocr';
import {
  lineLooksLikeMathOrFormula,
  tokenLooksLikeMathSymbol,
} from '../common/math-lesson-text';
import {
  criticalPageCueHits,
  englishPageTranscriptLooksIncomplete,
} from './page-text-sanitize';
import { cleanMergedPageOcrText, isProtectedStemAcronym } from './science-ocr-clean';
import { stripInterleavedWeblinkSidebar } from './sidebar-layout-ocr';

function normalizeLineKey(line: string): string {
  return line
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordOverlapRatio(a: string, b: string): number {
  const wa = new Set(
    normalizeLineKey(a).split(' ').filter((w) => w.length > 2),
  );
  const wb = new Set(
    normalizeLineKey(b).split(' ').filter((w) => w.length > 2),
  );
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) {
    if (wb.has(w)) inter += 1;
  }
  return inter / Math.max(wa.size, wb.size);
}

export function ocrLinesDuplicate(a: string, b: string): boolean {
  const ka = normalizeLineKey(a);
  const kb = normalizeLineKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (ka.length >= 14 && kb.length >= 14) {
    return wordOverlapRatio(a, b) >= 0.78;
  }
  return false;
}

function tokenLooksGarbage(token: string, alternateAtPosition?: string): boolean {
  const raw = token.trim();
  if (!raw) return false;
  if (tokenLooksLikeMathSymbol(raw)) return false;
  if (/^[\dW]+[.)]?$/.test(raw)) return false;
  // Keep step/list markers: "1:" "2." "iii." — short digit tokens are NOT garbage.
  if (/^\d{1,3}[.:)]?$/.test(raw)) return false;
  if (/^(?:i{1,3}|iv|vi{0,3}|ix|xi{0,2})\.?$/i.test(raw)) return false;
  // Standalone "57%" is usually OCR junk next to units — keep real "50%" only with letters around.
  if (/^\d{1,3}%$/.test(raw)) return true;
  if (/^[\d.,+\-×÷=/]+$/u.test(raw)) return false;
  if ((raw.match(/[|£€©®™@#\\<>{}]/g) ?? []).length >= 1) return true;
  const letters = raw.match(/[A-Za-z]+/g) ?? [];
  if (!letters.length) {
    // Keep Greek / math punctuation fragments; only drop tiny unknown junk.
    if (/[\u0370-\u03FF∪∩∈∅λμνπω°±×÷≈≠≤≥√∞=]/u.test(raw)) return false;
    return (raw.match(/[^\s]/g) ?? []).length <= 2;
  }
  const altLetters = alternateAtPosition?.match(/[A-Za-z]+/g)?.[0];
  for (const part of letters) {
    if (/^[A-Z]{3,6}$/.test(part) && !isProtectedStemAcronym(part)) return true;
    if (part.length >= 3 && !latinOcrWordLooksPlausible(part)) return true;
    if (
      altLetters &&
      altLetters.length >= 3 &&
      latinOcrWordLooksPlausible(altLetters) &&
      !latinOcrWordLooksPlausible(part) &&
      part.toLowerCase() !== altLetters.toLowerCase()
    ) {
      return true;
    }
  }
  return false;
}

function lineIsMostlyGarbage(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (lineLooksLikeMathOrFormula(trimmed)) return false;
  const latin = countLatinLetters(trimmed);
  if (latin < 6 && (trimmed.match(/[|£€©®@#\\]/g) ?? []).length >= 1) return true;
  const words = trimmed.match(/\S+/g) ?? [];
  if (!words.length) return true;
  const garbage = words.filter((w) => tokenLooksGarbage(w)).length;
  if (words.length >= 2 && garbage / words.length >= 0.45) return true;
  if ((trimmed.match(/[|£€©®@#\\]/g) ?? []).length >= 2 && latin < 40) return true;
  return false;
}

function mergeLineWords(primary: string, alternate: string): string {
  const pWords = primary.match(/\S+/g) ?? [];
  const aWords = alternate.match(/\S+/g) ?? [];
  if (!pWords.length) return alternate.trim();
  if (!aWords.length) return primary.trim();

  const merged = pWords.map((word, index) => {
    const direct = aWords[index];
    if (!tokenLooksGarbage(word, direct)) return word;
    if (direct && !tokenLooksGarbage(direct)) return direct;
    for (let delta = 1; delta <= 2; delta += 1) {
      const left = aWords[index - delta];
      const right = aWords[index + delta];
      if (left && !tokenLooksGarbage(left)) return left;
      if (right && !tokenLooksGarbage(right)) return right;
    }
    return word;
  });
  return merged.join(' ');
}

function findBestAlternateLineIndex(
  primaryLine: string,
  alternateLines: string[],
  used: Set<number>,
  minOverlap: number,
): number {
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < alternateLines.length; i += 1) {
    if (used.has(i)) continue;
    const score = wordOverlapRatio(primaryLine, alternateLines[i]);
    if (score >= minOverlap && score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** Coverage used to decide which engine is the merge base. */
export function scoreOcrMergeCoverage(text: string): number {
  const value = (text ?? '').trim();
  if (!value) return 0;
  const latin = countLatinLetters(value);
  const cues = criticalPageCueHits(value);
  const incompletePenalty = englishPageTranscriptLooksIncomplete(value) ? 180 : 0;
  return latin + cues * 90 + Math.min(400, Math.floor(value.length / 4)) - incompletePenalty;
}

/**
 * Prefer Tesseract as merge base when it has fuller reading-body coverage
 * (incomplete Paddle must not erase a longer story transcript).
 */
export function pickOcrMergePrimary(
  paddle: string,
  tesseract: string,
): 'paddle' | 'tesseract' {
  const p = (paddle ?? '').trim();
  const t = (tesseract ?? '').trim();
  if (!p) return 'tesseract';
  if (!t) return 'paddle';
  const pScore = scoreOcrMergeCoverage(p);
  const tScore = scoreOcrMergeCoverage(t);
  const pIncomplete = englishPageTranscriptLooksIncomplete(p);
  const tIncomplete = englishPageTranscriptLooksIncomplete(t);
  if (pIncomplete && !tIncomplete && countLatinLetters(t) >= countLatinLetters(p) * 0.85) {
    return 'tesseract';
  }
  if (tIncomplete && !pIncomplete && countLatinLetters(p) >= countLatinLetters(t) * 0.85) {
    return 'paddle';
  }
  if (tScore >= pScore + 80) return 'tesseract';
  if (countLatinLetters(t) >= countLatinLetters(p) + 220 && criticalPageCueHits(t) >= criticalPageCueHits(p)) {
    return 'tesseract';
  }
  return 'paddle';
}

function mergePrimaryWithAlternate(primary: string, alternate: string): string {
  const primaryLines = primary.split(/\r?\n/);
  const altLines = alternate.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const usedAlt = new Set<number>();
  const out: string[] = [];

  for (const rawLine of primaryLines) {
    const pl = rawLine.trim();
    if (!pl) {
      out.push('');
      continue;
    }

    const matchIdx = findBestAlternateLineIndex(pl, altLines, usedAlt, 0.5);
    if (matchIdx >= 0) usedAlt.add(matchIdx);

    if (lineIsMostlyGarbage(pl)) {
      const altLine = matchIdx >= 0 ? altLines[matchIdx] : undefined;
      if (altLine && !lineIsMostlyGarbage(altLine)) {
        out.push(altLine);
        continue;
      }
      const fallbackIdx = findBestAlternateLineIndex(pl, altLines, usedAlt, 0.28);
      if (fallbackIdx >= 0) {
        usedAlt.add(fallbackIdx);
        const fb = altLines[fallbackIdx];
        out.push(!lineIsMostlyGarbage(fb) ? fb : pl);
      } else {
        out.push(pl);
      }
      continue;
    }

    if (matchIdx >= 0) {
      out.push(mergeLineWords(pl, altLines[matchIdx]));
    } else {
      out.push(pl);
    }
  }

  for (let i = 0; i < altLines.length; i += 1) {
    if (usedAlt.has(i)) continue;
    const tl = altLines[i];
    if (lineIsMostlyGarbage(tl)) continue;
    const isMathLine = lineLooksLikeMathOrFormula(tl);
    if (tl.length < 10 && countLatinLetters(tl) < 8 && !isMathLine) continue;
    if (out.some((line) => ocrLinesDuplicate(line, tl))) continue;
    out.push(tl);
    usedAlt.add(i);
  }

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Merge Paddle + Tesseract. Uses the fuller transcript as the base when Paddle
 * is incomplete or Tesseract has substantially more reading-body coverage.
 */
export function mergePaddleAndTesseractPageOcr(paddle: string, tesseract: string): string {
  const p = (paddle ?? '').trim();
  const t = (tesseract ?? '').trim();
  if (!p && !t) return '';
  if (!p) return cleanMergedPageOcrText(stripInterleavedWeblinkSidebar(t));
  if (!t) return cleanMergedPageOcrText(stripInterleavedWeblinkSidebar(p));

  const primary = pickOcrMergePrimary(p, t);
  const merged =
    primary === 'tesseract' ? mergePrimaryWithAlternate(t, p) : mergePrimaryWithAlternate(p, t);
  // Drop interleaved Weblinks/YouTube sidebars after merge (no-op on literary pages).
  // Then collapse number duplicates / checkmark junk / science unit artifacts.
  return cleanMergedPageOcrText(stripInterleavedWeblinkSidebar(merged));
}
