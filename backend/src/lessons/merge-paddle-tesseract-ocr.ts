import { countLatinLetters } from '../common/extract-quality';
import { latinOcrWordLooksPlausible } from '../common/garbled-latin-ocr';

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
  if (/^[\dW]+[.)]?$/.test(raw)) return false;
  if ((raw.match(/[|£€©®@#\\<>{}]/g) ?? []).length >= 1) return true;
  const letters = raw.match(/[A-Za-z]+/g) ?? [];
  if (!letters.length) return (raw.match(/[^\s]/g) ?? []).length <= 2;
  const altLetters = alternateAtPosition?.match(/[A-Za-z]+/g)?.[0];
  for (const part of letters) {
    if (/^[A-Z]{3,6}$/.test(part) && part !== 'THE' && part !== 'AND') return true;
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

function findBestTessLineIndex(
  paddleLine: string,
  tessLines: string[],
  used: Set<number>,
  minOverlap: number,
): number {
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < tessLines.length; i += 1) {
    if (used.has(i)) continue;
    const score = wordOverlapRatio(paddleLine, tessLines[i]);
    if (score >= minOverlap && score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Paddle-first transcript with Tesseract filling gaps: dedupe lines, swap garbage
 * tokens/lines from the alternate engine, append Tesseract-only content.
 */
export function mergePaddleAndTesseractPageOcr(paddle: string, tesseract: string): string {
  const p = (paddle ?? '').trim();
  const t = (tesseract ?? '').trim();
  if (!p) return t;
  if (!t) return p;

  const paddleLines = p.split(/\r?\n/);
  const tessLines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const usedTess = new Set<number>();
  const out: string[] = [];

  for (const rawLine of paddleLines) {
    const pl = rawLine.trim();
    if (!pl) {
      out.push('');
      continue;
    }

    const matchIdx = findBestTessLineIndex(pl, tessLines, usedTess, 0.5);
    if (matchIdx >= 0) usedTess.add(matchIdx);

    if (lineIsMostlyGarbage(pl)) {
      const tessLine = matchIdx >= 0 ? tessLines[matchIdx] : undefined;
      if (tessLine && !lineIsMostlyGarbage(tessLine)) {
        out.push(tessLine);
        continue;
      }
      const fallbackIdx = findBestTessLineIndex(pl, tessLines, usedTess, 0.28);
      if (fallbackIdx >= 0) {
        usedTess.add(fallbackIdx);
        const fb = tessLines[fallbackIdx];
        out.push(!lineIsMostlyGarbage(fb) ? fb : pl);
      } else {
        out.push(pl);
      }
      continue;
    }

    if (matchIdx >= 0) {
      out.push(mergeLineWords(pl, tessLines[matchIdx]));
    } else {
      out.push(pl);
    }
  }

  for (let i = 0; i < tessLines.length; i += 1) {
    if (usedTess.has(i)) continue;
    const tl = tessLines[i];
    if (lineIsMostlyGarbage(tl)) continue;
    if (tl.length < 10 && countLatinLetters(tl) < 8) continue;
    if (out.some((line) => ocrLinesDuplicate(line, tl))) continue;
    out.push(tl);
    usedTess.add(i);
  }

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
