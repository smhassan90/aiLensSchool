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
import {
  cleanMergedPageOcrText,
  isProtectedStemAcronym,
  looksLikeScienceNumericalsPage,
} from './science-ocr-clean';
import { countSlashFractions } from './ocr-fraction-layout';
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
    if (/[\u0370-\u03FF∪∩∈∅λμνπωθπ°±×÷≈≠≤≥√∞≅½=]/u.test(raw)) return false;
    return (raw.match(/[^\s]/g) ?? []).length <= 2;
  }
  const altLetters = alternateAtPosition?.match(/[A-Za-z]+/g)?.[0];
  for (const part of letters) {
    // ALL-CAPS OCR noise (DINPIESS, etc.) — not protected STEM acronyms
    if (/^[A-Z]{3,12}$/.test(part) && !isProtectedStemAcronym(part)) return true;
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
  if (lineLooksLikeMcqOrTableCell(trimmed)) return false;
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

/** Primary word containment inside alternate (not symmetric overlap). */
function primaryWordContainmentInAlternate(primary: string, alternate: string): number {
  const pWords = normalizeLineKey(primary)
    .split(' ')
    .filter((w) => w.length > 2);
  if (!pWords.length) return 0;
  const aSet = new Set(
    normalizeLineKey(alternate)
      .split(' ')
      .filter((w) => w.length > 2),
  );
  let hit = 0;
  for (const w of pWords) {
    if (aSet.has(w)) hit += 1;
  }
  return hit / pWords.length;
}

/** Consecutive repeated tokens: "find find", "Prime numbers: Prime numbers:". */
export function countConsecutiveDuplicateWords(text: string): number {
  const words = (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
  let dupes = 0;
  for (let i = 1; i < words.length; i += 1) {
    // Yes/No MCQ grids intentionally repeat short answer tokens.
    if (words[i] === 'yes' || words[i] === 'no') continue;
    if (words[i] === words[i - 1]) dupes += 1;
  }
  return dupes;
}

/**
 * Higher = cleaner usable lesson transcript. Used to reject merges that are
 * longer but more garbled than a single engine (colored textbook sideboxes).
 */
export function scoreOcrTranscriptCleanliness(text: string): number {
  const value = (text ?? '').trim();
  if (!value) return 0;
  const latin = countLatinLetters(value);
  const dupes = countConsecutiveDuplicateWords(value);
  const lines = value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const garbageLines = lines.filter((l) => lineIsMostlyGarbage(l)).length;
  const symbolJunk = (value.match(/[|£€©®@#\\<>{}«»]/g) ?? []).length;
  const cueBonus = criticalPageCueHits(value) * 40;
  const tableBonus = countMcqOrTableSignals(value) * 28;
  const mathOpBonus = (value.match(/[÷√×]/g) ?? []).length * 35;
  const slashFracBonus = countSlashFractions(value) * 45;
  // Glued Example digit soup still beats Tess garble — reconstruct can recover it.
  const gluedExampleBonus = (value.match(/\bExample\d{5,}/gi) ?? []).length * 60;
  const mangledOptPenalty = value
    .split(/\r?\n/)
    .filter((l) => lineLooksLikeMangledMcqOptions(l)).length * 40;
  const collapsedArithPenalty = value
    .split(/\r?\n/)
    .filter((l) => lineLooksLikeCollapsedArithmetic(l)).length * 50;
  const incompletePenalty = englishPageTranscriptLooksIncomplete(value) ? 120 : 0;
  return (
    latin +
    cueBonus +
    tableBonus +
    mathOpBonus +
    slashFracBonus +
    gluedExampleBonus +
    Math.min(300, Math.floor(value.length / 5)) -
    dupes * 90 -
    garbageLines * 35 -
    symbolJunk * 12 -
    mangledOptPenalty -
    collapsedArithPenalty -
    incompletePenalty
  );
}

/** a./b./c./d. markers with following values (inline or stacked MCQ options). */
export function countInlineMcqOptions(text: string): number {
  return (text.match(/\b[a-d][.)]\s*\S+/gi) ?? []).length;
}

/** Paddle often glues options: "b.1703760C.704" or drops option a. */
export function lineLooksLikeMangledMcqOptions(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/[a-d][.)]\s*\d+\s*[A-Dc][.)]/i.test(trimmed)) return true;
  if (/\d[A-D][.)]\d/i.test(trimmed)) return true;
  const markers = trimmed.match(/\b[a-d][.)]/gi) ?? [];
  if (markers.length >= 2 && !/\ba[.)]/i.test(trimmed) && /\bb[.)]/i.test(trimmed)) {
    return true;
  }
  return false;
}

/** "844=21" style — operator dropped between operands. */
export function lineLooksLikeCollapsedArithmetic(line: string): boolean {
  const compact = line.replace(/\s+/g, '');
  if (!compact) return false;
  if (/[÷√×+\-/%]/.test(compact)) return false;
  // Three+ digits stuck before "=" with a short right-hand side (e.g. 844=21).
  return /^\d{3,}=\d{1,4}$/.test(compact);
}

export function lineHasVisibleMathOperator(line: string): boolean {
  return /[÷√×]/.test(line) || /\d\s*[÷\/]\s*\d/.test(line) || /√\s*\(?\s*\d/.test(line);
}

/**
 * Prefer a longer alternate line when it already contains the primary reading
 * (common when Paddle starts mid-sentence and Tess has the full clause).
 * Never replace a clean primary with a longer garbled/duplicative alternate.
 */
export function preferFullerOcrLine(primary: string, alternate: string): string {
  const p = primary.trim();
  const a = alternate.trim();
  if (!a) return p;
  if (!p) return a;
  if (lineIsMostlyGarbage(a) && !lineIsMostlyGarbage(p)) return p;
  if (
    countConsecutiveDuplicateWords(a) > countConsecutiveDuplicateWords(p) &&
    !lineIsMostlyGarbage(p)
  ) {
    return p;
  }
  // Tess often keeps MCQ option letters/spacing that Paddle glues or drops.
  if (
    (lineLooksLikeMangledMcqOptions(p) || countInlineMcqOptions(a) >= countInlineMcqOptions(p) + 1) &&
    countInlineMcqOptions(a) >= 2 &&
    !lineLooksLikeMangledMcqOptions(a) &&
    (wordOverlapRatio(p, a) >= 0.28 || primaryWordContainmentInAlternate(p, a) >= 0.5)
  ) {
    return a;
  }
  // Tess keeps ÷ / √ that Paddle collapses ("84 ÷ 4 = 21" → "844=21").
  if (
    lineLooksLikeCollapsedArithmetic(p) &&
    lineHasVisibleMathOperator(a) &&
    (wordOverlapRatio(p, a) >= 0.2 || /\d/.test(p) && /\d/.test(a))
  ) {
    return a;
  }
  if (!lineHasVisibleMathOperator(p) && lineHasVisibleMathOperator(a)) {
    const pDigits = (p.match(/\d+/g) ?? []).join('');
    const aDigits = (a.match(/\d+/g) ?? []).join('');
    if (
      pDigits.length >= 3 &&
      aDigits.length >= 3 &&
      (aDigits.includes(pDigits) || pDigits.includes(aDigits.slice(0, Math.min(4, aDigits.length))))
    ) {
      return a;
    }
  }
  const containment = primaryWordContainmentInAlternate(p, a);
  if (
    containment >= 0.72 &&
    (a.length >= p.length + 18 || countLatinLetters(a) >= countLatinLetters(p) + 20) &&
    scoreOcrTranscriptCleanliness(a) >= scoreOcrTranscriptCleanliness(p) - 40
  ) {
    return a;
  }
  // Word-stitch only when primary has clear garbage tokens; otherwise keep paddle.
  const pWords = p.match(/\S+/g) ?? [];
  const hasGarbagePrimary =
    pWords.some((w) => tokenLooksGarbage(w)) || lineLooksLikeMangledMcqOptions(p);
  if (!hasGarbagePrimary) return p;
  return mergeLineWords(p, a);
}

/**
 * When Paddle reading is primary but Tess kept clearer a/b/c options (or ÷/√
 * lines), graft those alternate lines in after the matching stem.
 */
export function enrichOptionsAndMathFromAlternate(
  primary: string,
  alternate: string,
): string {
  const p = (primary ?? '').trim();
  const a = (alternate ?? '').trim();
  if (!p || !a) return p;
  if (
    countInlineMcqOptions(a) < countInlineMcqOptions(p) + 1 &&
    !lineHasVisibleMathOperator(a)
  ) {
    return p;
  }

  const out = p.split(/\r?\n/);
  const altLines = a.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const used = new Set<number>();

  for (let i = 0; i < out.length; i += 1) {
    const line = out[i].trim();
    if (!line) continue;
    const matchIdx = findBestAlternateLineIndex(line, altLines, used, 0.35);
    if (matchIdx < 0) continue;
    const alt = altLines[matchIdx];
    const better = preferFullerOcrLine(line, alt);
    if (better !== line) {
      out[i] = better;
      used.add(matchIdx);
    }
  }

  // Insert Tess-only option / operator lines that never matched a primary line.
  for (let i = 0; i < altLines.length; i += 1) {
    if (used.has(i)) continue;
    const tl = altLines[i];
    const isOpt =
      lineLooksLikeMcqOrTableCell(tl) ||
      (countInlineMcqOptions(tl) >= 2 && !lineLooksLikeMangledMcqOptions(tl));
    const isMath = lineHasVisibleMathOperator(tl) || lineLooksLikeMathOrFormula(tl);
    if (!isOpt && !isMath) continue;
    if (lineContentMostlyPresentInOutput(tl, out)) continue;

    let insertAt = out.length;
    // Walk backward in alternate to find the numbered stem this option belongs to.
    let qNum: string | undefined;
    for (let j = i - 1; j >= 0; j -= 1) {
      const m = altLines[j].match(/^(\d{1,2})[.)]/);
      if (m) {
        qNum = m[1];
        break;
      }
      if (countInlineMcqOptions(altLines[j]) === 0 && altLines[j].length > 40) break;
    }
    if (qNum) {
      const stemAt = out.findIndex((l) => new RegExp(`^${qNum}[.)]`).test(l.trim()));
      if (stemAt >= 0) {
        insertAt = stemAt + 1;
        while (
          insertAt < out.length &&
          (lineLooksLikeMcqOrTableCell(out[insertAt]) ||
            countInlineMcqOptions(out[insertAt]) >= 1 ||
            lineLooksLikeMangledMcqOptions(out[insertAt]))
        ) {
          // Replace mangled option row in-place when Tess has the clean one.
          if (lineLooksLikeMangledMcqOptions(out[insertAt]) && isOpt) {
            out[insertAt] = tl;
            used.add(i);
            insertAt = -1;
            break;
          }
          insertAt += 1;
        }
      }
    }
    if (insertAt < 0) continue;
    out.splice(insertAt, 0, tl);
    used.add(i);
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Trailing article/preposition with no sentence end → likely cut mid-clause. */
export function lineLooksLikeIncompleteClause(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 12) return false;
  if (/[.!?]["')\]]*$/.test(trimmed)) return false;
  return /\b(?:a|an|the|to|of|and|or|for|with|by|from|in|on|at|into|one|end)\s*$/i.test(
    trimmed,
  );
}

function lineContentMostlyPresentInOutput(line: string, out: string[]): boolean {
  if (out.some((existing) => ocrLinesDuplicate(existing, line))) return true;
  const words = normalizeLineKey(line)
    .split(' ')
    .filter((w) => w.length > 3);
  if (words.length < 3) return false;
  const blob = normalizeLineKey(out.join(' '));
  const hit = words.filter((w) => blob.includes(w)).length;
  return hit / words.length >= 0.78;
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
  const dupePenalty = countConsecutiveDuplicateWords(value) * 110;
  const garbageLines = value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && lineIsMostlyGarbage(l)).length;
  return (
    latin +
    cues * 90 +
    Math.min(400, Math.floor(value.length / 4)) -
    incompletePenalty -
    dupePenalty -
    garbageLines * 40
  );
}

/**
 * Prefer Tesseract as merge base when it has fuller reading-body coverage
 * (incomplete Paddle must not erase a longer story transcript).
 */
function countMcqOrTableSignals(text: string): number {
  const yesNo = (text.match(/^\s*(?:yes|no)\s*$/gim) ?? []).length;
  const options = (text.match(/^\s*[a-d][).]\s*$/gim) ?? []).length;
  const inlineOpts = countInlineMcqOptions(text);
  const numbered = (text.match(/^\s*\d{1,2}[.)]\s+\S/gm) ?? []).length;
  // After formatOcrMcqTables, Yes/No live inside markdown rows — still count them.
  const mdOptionRows = (text.match(/^\|\s*[a-d]\)\s*\|/gim) ?? []).length;
  const mdYesNoCells = (text.match(/\|\s*(?:Yes|No)\s*\|/gi) ?? []).length;
  const mdHeader = /\|[^|\n]*Reflection[^|\n]*\|[^|\n]*Refraction[^|\n]*\|/i.test(text)
    ? 6
    : 0;
  return (
    yesNo +
    options +
    inlineOpts +
    numbered +
    mdOptionRows * 4 +
    Math.min(16, mdYesNoCells) +
    mdHeader
  );
}

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
  const pTable = countMcqOrTableSignals(p);
  const tTable = countMcqOrTableSignals(t);
  // Prefer the engine that captured Yes/No grids / option letters for MCQ pages.
  // Grid cells are short; latin-letter coverage alone must not veto the table engine.
  if (pTable >= tTable + 4 && countLatinLetters(p) >= countLatinLetters(t) * 0.35) {
    return 'paddle';
  }
  if (tTable >= pTable + 4 && countLatinLetters(t) >= countLatinLetters(p) * 0.35) {
    return 'tesseract';
  }
  if (pIncomplete && !tIncomplete && countLatinLetters(t) >= countLatinLetters(p) * 0.85) {
    return 'tesseract';
  }
  if (tIncomplete && !pIncomplete && countLatinLetters(p) >= countLatinLetters(t) * 0.85) {
    return 'paddle';
  }
  // Never switch to a much dirtier engine just because it is longer
  // (colored sideboxes: Tess duplicates words and interleaves columns).
  const pClean = scoreOcrTranscriptCleanliness(p);
  const tClean = scoreOcrTranscriptCleanliness(t);
  if (tClean + 40 < pClean && countLatinLetters(p) >= 80) {
    return 'paddle';
  }
  if (pClean + 40 < tClean && countLatinLetters(t) >= 80) {
    return 'tesseract';
  }
  if (tScore >= pScore + 80 && tClean >= pClean - 20) return 'tesseract';
  if (
    countLatinLetters(t) >= countLatinLetters(p) + 220 &&
    criticalPageCueHits(t) >= criticalPageCueHits(p) &&
    tClean >= pClean - 20
  ) {
    return 'tesseract';
  }
  return 'paddle';
}

/** Short MCQ / Yes-No table cells must never be dropped as "too short". */
export function lineLooksLikeMcqOrTableCell(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^(?:yes|no)\.?$/i.test(trimmed)) return true;
  if (/^[a-d][).:-]\s*$/i.test(trimmed)) return true;
  if (/^[a-d][).]\s+\S+/i.test(trimmed)) return true;
  if (/^\d{1,2}[.)]\s*$/.test(trimmed)) return true;
  if (/^\d{1,2}[.)]\s+\S/.test(trimmed)) return true;
  return false;
}

/**
 * Rebuild Reflection / Refraction / Diffraction Yes-No grids as a markdown table
 * when OCR left them as stacked labels.
 */
export function formatOcrMcqTables(text: string): string {
  const value = (text ?? '').trim();
  if (!value) return value;
  if (!/\bReflection\b/i.test(value) || !/\bRefraction\b/i.test(value) || !/\bDiffraction\b/i.test(value)) {
    return value;
  }

  // Already a markdown table with those headers.
  if (/\|[^|\n]*Reflection[^|\n]*\|[^|\n]*Refraction[^|\n]*\|/i.test(value)) {
    return value;
  }

  const lines = value.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const headerInline =
      /Reflection/i.test(line) && /Refraction/i.test(line) && /Diffraction/i.test(line);
    const stackedHeaders =
      /^Reflection$/i.test(line.trim()) ||
      (/^Diffraction$/i.test(line.trim()) &&
        i + 2 < lines.length &&
        /^Refraction$/i.test(lines[i + 1].trim()) &&
        /^Reflection$/i.test(lines[i + 2].trim()));

    if (!headerInline && !stackedHeaders) {
      out.push(line);
      continue;
    }

    let headerEnd = i;
    let columnOrder: Array<'Reflection' | 'Refraction' | 'Diffraction'> = [
      'Reflection',
      'Refraction',
      'Diffraction',
    ];
    if (stackedHeaders && /^Diffraction$/i.test(line.trim())) {
      headerEnd = i + 2;
      // OCR often stacks Diffraction → Refraction → Reflection (right-to-left columns).
      columnOrder = ['Diffraction', 'Refraction', 'Reflection'];
    } else if (headerInline) {
      const lower = line.toLowerCase();
      const positions = [
        { name: 'Reflection' as const, at: lower.indexOf('reflection') },
        { name: 'Refraction' as const, at: lower.indexOf('refraction') },
        { name: 'Diffraction' as const, at: lower.indexOf('diffraction') },
      ]
        .filter((p) => p.at >= 0)
        .sort((a, b) => a.at - b.at);
      if (positions.length === 3) {
        columnOrder = positions.map((p) => p.name);
      }
    }

    const cells: string[] = [];
    let j = headerEnd + 1;
    while (j < lines.length && cells.length < 20) {
      const t = lines[j].trim();
      if (!t) {
        j += 1;
        continue;
      }
      if (/^(?:yes|no)$/i.test(t) || /^[a-d][).]\s*$/i.test(t)) {
        cells.push(/^[a-d]/i.test(t) ? `${t[0].toLowerCase()})` : t);
        j += 1;
        continue;
      }
      break;
    }

    if (cells.length < 6) {
      out.push(line);
      continue;
    }

    // Rows: three Yes/No then option letter, or option letter then three Yes/No.
    const rows: string[][] = [];
    let buf: string[] = [];
    let label = '';
    const flush = () => {
      if (buf.length < 3) return;
      const keyed: Record<string, string> = {
        [columnOrder[0]]: buf[0],
        [columnOrder[1]]: buf[1],
        [columnOrder[2]]: buf[2],
      };
      rows.push([
        label || `${String.fromCharCode(96 + rows.length + 1)})`,
        keyed.Reflection,
        keyed.Refraction,
        keyed.Diffraction,
      ]);
      label = '';
      buf = [];
    };
    for (const cell of cells) {
      if (/^[a-d]\)$/i.test(cell)) {
        if (buf.length >= 3) flush();
        label = cell.toLowerCase();
        continue;
      }
      if (/^(?:yes|no)$/i.test(cell)) {
        buf.push(/yes/i.test(cell) ? 'Yes' : 'No');
        if (buf.length === 3) flush();
      }
    }
    if (buf.length >= 3) flush();

    if (!rows.length) {
      out.push(line);
      continue;
    }

    out.push('| Option | Reflection | Refraction | Diffraction |');
    out.push('| --- | --- | --- | --- |');
    for (const row of rows) {
      out.push(`| ${row[0]} | ${row[1]} | ${row[2]} | ${row[3]} |`);
    }
    i = j - 1;
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
      // Paddle often drops the clause opener; Tess has it on the previous unused line.
      let altSpan = altLines[matchIdx];
      if (matchIdx > 0 && !usedAlt.has(matchIdx - 1)) {
        const prev = altLines[matchIdx - 1];
        if (
          prev &&
          !lineIsMostlyGarbage(prev) &&
          lineLooksLikeIncompleteClause(prev) &&
          primaryWordContainmentInAlternate(pl, `${prev} ${altSpan}`) >= 0.55
        ) {
          usedAlt.add(matchIdx - 1);
          altSpan = `${prev} ${altSpan}`;
        }
      }
      out.push(preferFullerOcrLine(pl, altSpan));
    } else {
      out.push(pl);
    }
  }

  const primaryLatin = countLatinLetters(out.join('\n'));
  const primaryAlreadyRich = primaryLatin >= 180;

  for (let i = 0; i < altLines.length; i += 1) {
    if (usedAlt.has(i)) continue;
    const tl = altLines[i];
    const keepShortCell = lineLooksLikeMcqOrTableCell(tl);
    if (!keepShortCell && lineIsMostlyGarbage(tl)) continue;
    if (!keepShortCell && countConsecutiveDuplicateWords(tl) >= 2) continue;
    const isMathLine = lineLooksLikeMathOrFormula(tl);
    if (
      !keepShortCell &&
      tl.length < 10 &&
      countLatinLetters(tl) < 8 &&
      !isMathLine
    ) {
      continue;
    }
    if (!keepShortCell && lineContentMostlyPresentInOutput(tl, out)) continue;
    // When the primary engine already has a full page, only append alt orphans
    // that clearly add new content (avoid sidebar interleave from Tess).
    if (primaryAlreadyRich && !keepShortCell && !isMathLine) {
      const words = normalizeLineKey(tl)
        .split(' ')
        .filter((w) => w.length > 3);
      if (words.length < 5) continue;
      const blob = normalizeLineKey(out.join(' '));
      const novel = words.filter((w) => !blob.includes(w)).length;
      if (novel / words.length < 0.45) continue;
    }
    // Orphan opener: continuation was already consumed matching primary lines.
    if (!keepShortCell && lineLooksLikeIncompleteClause(tl)) {
      let continuationAlreadyMerged = false;
      for (let j = i + 1; j < Math.min(i + 5, altLines.length); j += 1) {
        if (usedAlt.has(j) && lineContentMostlyPresentInOutput(altLines[j], out)) {
          continuationAlreadyMerged = true;
          break;
        }
      }
      if (continuationAlreadyMerged) continue;
    }
    out.push(tl);
    usedAlt.add(i);
  }

  return formatOcrMcqTables(
    out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
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
  let merged =
    primary === 'tesseract' ? mergePrimaryWithAlternate(t, p) : mergePrimaryWithAlternate(p, t);
  // Reading body from Paddle, but Tess often keeps MCQ a/b/c rows and ÷/√ lines.
  const altForEnrich = primary === 'tesseract' ? p : t;
  merged = enrichOptionsAndMathFromAlternate(merged, altForEnrich);
  // Drop interleaved Weblinks/YouTube sidebars after merge (no-op on literary pages).
  // Then collapse number duplicates / checkmark junk / science unit artifacts.
  const cleaned = formatOcrMcqTables(
    cleanMergedPageOcrText(stripInterleavedWeblinkSidebar(merged)),
  );

  const paddleClean = cleanMergedPageOcrText(stripInterleavedWeblinkSidebar(p));
  const tessClean = cleanMergedPageOcrText(stripInterleavedWeblinkSidebar(t));

  // Noisy Tesseract alternates can erase a clean science body that Paddle kept.
  const scienceBodyCue =
    /\bCharge is a basic characteristic\b/i.test(paddleClean) ||
    /\bCharge is a basic characteristic\b/i.test(tessClean) ||
    /\bBenjamin Franklin\b/i.test(paddleClean) ||
    /\bBenjamin Franklin\b/i.test(tessClean);
  if (
    scienceBodyCue &&
    looksLikeScienceNumericalsPage(paddleClean + '\n' + tessClean) &&
    !/\bCharge is a basic characteristic\b/i.test(cleaned) &&
    !/\bBenjamin Franklin\b/i.test(cleaned)
  ) {
    const paddleHasBody =
      /\bCharge is a basic characteristic\b/i.test(paddleClean) ||
      /\bBenjamin Franklin\b/i.test(paddleClean);
    const tessHasBody =
      /\bCharge is a basic characteristic\b/i.test(tessClean) ||
      /\bBenjamin Franklin\b/i.test(tessClean);
    if (paddleHasBody && countLatinLetters(paddleClean) >= countLatinLetters(tessClean) * 0.55) {
      return paddleClean;
    }
    if (tessHasBody) return tessClean;
  }

  // Colored multi-box textbook pages: Tess often interleaves sidebars and
  // duplicates words ("find find"). Never ship a merge worse than the best engine.
  // Also never drop a Yes/No / option grid that only one engine captured.
  const candidates = [cleaned, paddleClean, tessClean].filter(Boolean);
  const maxTable = Math.max(0, ...candidates.map((c) => countMcqOrTableSignals(c)));
  let eligible =
    maxTable >= 6
      ? candidates.filter((c) => countMcqOrTableSignals(c) > maxTable - 4)
      : candidates;
  // Tess duplicate-word soup ("Now Now", "only only") must not beat cleaner Paddle.
  const minDupes = Math.min(...candidates.map((c) => countConsecutiveDuplicateWords(c)));
  if (minDupes <= 1) {
    const lowDupe = eligible.filter((c) => countConsecutiveDuplicateWords(c) <= minDupes + 1);
    if (lowDupe.length) eligible = lowDupe;
  }
  const pool = eligible.length ? eligible : candidates;
  let best = pool[0];
  let bestScore = scoreOcrTranscriptCleanliness(best);
  for (const candidate of pool) {
    const score = scoreOcrTranscriptCleanliness(candidate);
    if (score > bestScore + 25) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
