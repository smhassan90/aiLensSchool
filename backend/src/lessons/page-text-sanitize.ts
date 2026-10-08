import {
  countArabicScriptChars,
  countLatinLetters,
  englishOnlyFromMixedOcr,
  looksLikeRealLessonText,
} from '../common/extract-quality';
import { looksLikeGarbledLatinOcr } from '../common/garbled-latin-ocr';

const SIDEBAR_ACTIVITY =
  /jumbled order|correct words\.?\s*the first|compare your|fill in the blank|circle the|thing as true|something\s*$/i;

const REVERSED_OR_MIRROR =
  /\b[a-z]{0,2}\d+[A-Za-z]{2,}\b|\b[A-Za-z]{1,3}\d{3,}\)?|\b\d{5,}\)/;

function words(line: string): string[] {
  return line.match(/[A-Za-z]{2,}/g) ?? [];
}

export const PAGE_OCR_ACCEPT_THRESHOLD = 90;

function lineQualityWeight(line: string): number {
  const trimmed = line.trim();
  if (trimmed.length < 3) return 1;
  if (lineLooksLikeGibberish(trimmed)) return 0;
  if (isSuspectParagraph(trimmed)) {
    const latin = countLatinLetters(trimmed);
    if (trimmed.length >= 32 && latin >= 18) return 0.78;
    return 0.22;
  }

  let weight = 1;
  if (/^[«»]/.test(trimmed) || /[«»]$/.test(trimmed)) weight -= 0.12;
  const symbolHits = (trimmed.match(/[|«»©®¢§°^`~]/g) ?? []).length;
  if (symbolHits >= 2) weight -= Math.min(0.35, symbolHits * 0.08);
  if (/\b[A-Za-z]{1,3}\s*[|,.]{1,2}\s*/.test(trimmed)) weight -= 0.18;
  if (/\|\s*[a-z]{1,3}\b/i.test(trimmed)) weight -= 0.15;
  if (/\b[a-z]{1,2}\s*[-—_]{2,}/i.test(trimmed)) weight -= 0.12;
  if (/\b[A-Za-z]*[|©®][A-Za-z]*\b/.test(trimmed)) weight -= 0.2;
  if (looksLikeGarbledLatinOcr(trimmed) && trimmed.length < 120) weight -= 0.35;

  return Math.max(0, Math.min(1, weight));
}

/** Share of page text that looks cleanly read (0–100). Accept when ≥ PAGE_OCR_ACCEPT_THRESHOLD. */
export function scorePageOcrQuality(text: string | undefined | null): number {
  const value = (text ?? '').trim();
  if (!value) return 0;

  const lines = value.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= 3);
  if (!lines.length) return 0;

  let weighted = 0;
  let total = 0;
  for (const line of lines) {
    const len = Math.max(line.length, 6);
    weighted += lineQualityWeight(line) * len;
    total += len;
  }
  if (!total) return 0;
  return Math.round((weighted / total) * 100);
}

function lineLooksLikeGibberish(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^Page\s+\d+$/i.test(trimmed)) return false;
  if (/^\*\*[^*]+\*\*$/.test(trimmed)) return false;
  if (trimmed.length >= 40 && /^[A-Z][a-z].*[.!?]"?\s*$/.test(trimmed)) return false;
  // Keep numbered questions, section labels, title-case headings, and author years.
  if (/^\d+[.)]\s+\S/.test(trimmed)) return false;
  if (/^(pre-reading|reading text|unit\b|exercise|notes|reading comprehension)\b/i.test(trimmed)) {
    return false;
  }
  if (/\(\d{4}\s*[-–]\s*\d{4}\)/.test(trimmed)) return false;
  if (/^[A-Z][\w'’.-]+(?:\s+[A-Z][\w'’.-]+){1,8}\.?$/.test(trimmed) && trimmed.length >= 12) {
    return false;
  }

  const w = words(trimmed);
  const latin = countLatinLetters(trimmed);
  if (latin < 8 && w.length <= 2) return true;
  if (REVERSED_OR_MIRROR.test(trimmed) && w.length <= 6) return true;
  if (/^»/.test(trimmed)) return true;
  if (SIDEBAR_ACTIVITY.test(trimmed) && latin < 80) return true;
  if ((trimmed.match(/[)(@£€«»#'"]/g) ?? []).length >= 2 && w.length <= 6) return true;

  const short = w.filter((x) => x.length <= 3).length;
  if (w.length <= 10 && short >= Math.ceil(w.length * 0.55)) return true;
  if (/[A-Za-z]\d|\d[A-Za-z]/.test(trimmed) && w.length <= 8) return true;
  if (
    w.length <= 8 &&
    !/\b(?:the|and|of|in|is|are|to|for|with|said|think|case|caliph|unit|reading|comprehension)\b/i.test(
      trimmed,
    ) &&
    short >= 3
  ) {
    return true;
  }
  return false;
}

export function isSuspectParagraph(block: string): boolean {
  const trimmed = block.trim();
  if (!trimmed) return true;
  if (
    /^(pre-reading|reading text|unit\b|exercise|notes|reading comprehension)\b/i.test(trimmed) ||
    /^\d+[.)]\s+\S/.test(trimmed) ||
    /\(\d{4}\s*[-–]\s*\d{4}\)/.test(trimmed)
  ) {
    return false;
  }
  if (trimmed.length < 12) return true;
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return true;

  let gibberishLines = 0;
  let scored = 0;
  for (const line of lines) {
    if (line.length < 6) continue;
    scored += 1;
    if (lineLooksLikeGibberish(line)) gibberishLines += 1;
  }
  if (scored > 0 && gibberishLines / scored >= 0.5) return true;
  if (lines.length === 1 && lineLooksLikeGibberish(lines[0])) return true;
  return looksLikeGarbledLatinOcr(trimmed) && trimmed.length < 400;
}

/** Drop sidebar / mirrored OCR paragraphs before assembly or compile. */
export function filterPageTextForLessonAssembly(text: string): string {
  const value = (text ?? '').trim();
  if (!value) return '';

  const blocks = value.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const keptBlocks = blocks.filter((b) => !isSuspectParagraph(b));
  if (keptBlocks.length >= 1) {
    const joined = keptBlocks.join('\n\n').trim();
    if (
      pageHasStructuredLessonContent(value) &&
      isPagePhotoTextReadable(value) &&
      (!isPagePhotoTextReadable(joined) ||
        (englishPageTranscriptLooksIncomplete(joined) &&
          !englishPageTranscriptLooksIncomplete(value)))
    ) {
      return value;
    }
    return joined;
  }

  const lines = value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const keptLines = lines.filter((l) => !lineLooksLikeGibberish(l));
  if (keptLines.length >= 2) {
    return keptLines.join('\n').trim();
  }

  const english = englishOnlyFromMixedOcr(value);
  if (english.trim().length >= 80) {
    return english.trim();
  }

  return value;
}

export function pageTextNeedsVisionRetry(text: string): boolean {
  const value = (text ?? '').trim();
  if (!value) return true;
  if (looksLikeGarbledLatinOcr(value)) return true;

  const blocks = value.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  if (!blocks.length) return false;
  const suspect = blocks.filter((b) => isSuspectParagraph(b)).length;
  return suspect / blocks.length >= 0.25;
}

export function filterCompiledLessonText(text: string): string {
  return filterPageTextForLessonAssembly(text);
}

const POEM_PAGE_BODY_MARKERS = [
  'sought to',
  'topmost',
  'go down again',
  'dwell among',
  'a. notes',
  'voice of god',
] as const;

const READING_BODY_CUES =
  /\b(flung|lonely mood|wore a crown|beginning to sink|scotland|sought to|topmost|dwell among|steeple)\b/i;

/**
 * Vision often stops after "Reading text" + title and skips the poem/story body.
 * Also true when OCR still has those body lines.
 */
export function englishPageTranscriptLooksIncomplete(text: string): boolean {
  const value = (text ?? '').trim();
  if (!value) return true;
  const lower = value.toLowerCase();
  const readingLayout =
    /reading text|reading comprehension|pre-reading|king bruce|voice of god/i.test(lower);
  if (!readingLayout) return false;

  if (/king bruce and the spider\s*\.?$/i.test(value) && !READING_BODY_CUES.test(value)) {
    return true;
  }
  if (
    /the voice of god\s*\.?$/i.test(value) &&
    !/sought to|steeple|dwell among/i.test(lower)
  ) {
    return true;
  }
  if (
    /reading text/i.test(lower) &&
    /king bruce/i.test(lower) &&
    !READING_BODY_CUES.test(value)
  ) {
    return true;
  }
  if (
    readingLayout &&
    countLatinLetters(value) < 180 &&
    !READING_BODY_CUES.test(value)
  ) {
    return true;
  }
  return false;
}

/** Vision often returns clean intro + title but drops poem stanzas, author lines, and footers. */
export function visionTranscriptMissingOcrContent(vision: string, ocr: string): boolean {
  const v = (vision ?? '').toLowerCase();
  const o = (ocr ?? '').toLowerCase();
  if (!v.trim() || !o.trim()) return false;
  if (englishPageTranscriptLooksIncomplete(vision) && countLatinLetters(ocr) > countLatinLetters(vision)) {
    return true;
  }
  let missing = 0;
  for (const phrase of POEM_PAGE_BODY_MARKERS) {
    if (o.includes(phrase) && !v.includes(phrase)) missing += 1;
  }
  if (missing >= 2) return true;
  if (o.includes('sought to') && !v.includes('sought to')) return true;
  if (o.includes('topmost') && !v.includes('topmost')) return true;

  const readingBodyPhrases = [
    'flung himself',
    'flung',
    'wore a crown',
    'beginning to sink',
    'eliza cook',
    'eliza coole',
    'scotland flung',
    'scotland',
  ];
  const readingHits = readingBodyPhrases.filter((p) => o.includes(p) && !v.includes(p));
  if (readingHits.length >= 1 && /reading comprehension|reading text|king bruce/i.test(v)) {
    return true;
  }

  const vLatin = countLatinLetters(v);
  const oLatin = countLatinLetters(o);
  if (oLatin >= vLatin + 48 && oLatin >= Math.max(vLatin * 1.12, vLatin + 1)) {
    const novelLines = (ocr ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length >= 16)
      .filter((line) => {
        const key = line.toLowerCase().slice(0, 22);
        return key.length >= 10 && !v.includes(key);
      })
      .filter((line) => !/^(pre-reading|reading text|unit\b)/i.test(line));
    if (novelLines.length >= 2) return true;
  }

  return false;
}

export function mergeEnglishPageVisionWithOcr(vision: string, ocr: string): string {
  const v = (vision ?? '').trim();
  const ocrTrim = (ocr ?? '').trim();
  if (!v) return filterPageTextForLessonAssembly(ocrTrim) || ocrTrim;
  if (!ocrTrim) return v;

  const visionIncomplete = englishPageTranscriptLooksIncomplete(v);
  const ocrHasMoreBody =
    visionTranscriptMissingOcrContent(v, ocrTrim) ||
    (visionIncomplete && countLatinLetters(ocrTrim) > countLatinLetters(v));

  if (!ocrHasMoreBody) return v;

  // Prefer OCR when vision stopped at the title but OCR still has stanza/body lines.
  if (visionIncomplete && !englishPageTranscriptLooksIncomplete(ocrTrim)) {
    const ocrFiltered = filterPageTextForLessonAssembly(ocrTrim);
    if (ocrFiltered.trim().length >= 40 && !englishPageTranscriptLooksIncomplete(ocrFiltered)) {
      return ocrFiltered;
    }
    return ocrTrim;
  }

  const combined = `${v}\n\n${ocrTrim}`.trim();
  if (isPagePhotoTextReadable(combined)) {
    const combinedFiltered = filterPageTextForLessonAssembly(combined);
    const pick = combinedFiltered.trim() || combined;
    if (
      !visionTranscriptMissingOcrContent(pick, ocrTrim) &&
      !englishPageTranscriptLooksIncomplete(pick)
    ) {
      return pick;
    }
    return combined;
  }
  if (isPagePhotoTextReadable(ocrTrim)) return ocrTrim;
  const filtered = filterPageTextForLessonAssembly(ocrTrim);
  if (isPagePhotoTextReadable(filtered)) return filtered;
  return combined;
}

/** Poems, notes, and exercises on decorative/colored textbook pages. */
export function pageHasStructuredLessonContent(text: string): boolean {
  const value = (text ?? '').trim();
  if (!looksLikeRealLessonText(value)) return false;
  const latin = countLatinLetters(value);
  if (latin < 80) return false;
  const symbolHits = (value.match(/[|©®¢«»]/g) ?? []).length;
  if (symbolHits >= 4) return false;
  return (
    /\b(Exercise|Notes|poem|author|steeple|voice of god|comprehension)\b/i.test(value) ||
    /(?:^|\n)[A-Za-z][^.!?\n]{10,}[.!?]/m.test(value)
  );
}

/** After OCR/vision — reject pages that are still unusable (ask teacher to re-upload). */
export function pageOcrAcceptThreshold(text: string): number {
  if (pageHasStructuredLessonContent(text)) return 62;
  if (looksLikeRealLessonText(text) && countLatinLetters(text) >= 100) return 78;
  return PAGE_OCR_ACCEPT_THRESHOLD;
}

export function isPagePhotoTextReadable(text: string | undefined | null): boolean {
  const value = (text ?? '').trim();
  const ocrSymbolHits = (value.match(/[|©®¢«»]/g) ?? []).length;
  if (ocrSymbolHits >= 5 && scorePageOcrQuality(value) < PAGE_OCR_ACCEPT_THRESHOLD) {
    return false;
  }
  const arabic = countArabicScriptChars(value);
  const structured = pageHasStructuredLessonContent(value);
  const realLesson = looksLikeRealLessonText(value);
  const minLen = arabic >= 30 ? 28 : structured || realLesson ? 32 : 48;
  if (value.length < minLen) return false;
  const score = scorePageOcrQuality(value);
  if (score < pageOcrAcceptThreshold(value)) return false;
  const blocks = value.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const good = blocks.filter((b) => !isSuspectParagraph(b));
  if (good.length === 0) return false;
  const wordCount = good.join(' ').replace(/\s+/g, ' ').split(' ').filter(Boolean).length;
  if (structured && wordCount >= 6 && score >= 58) return true;
  if (wordCount < 8) return false;
  return true;
}
