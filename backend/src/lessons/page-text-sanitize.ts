import {
  countArabicScriptChars,
  countLatinLetters,
  englishOnlyFromMixedOcr,
} from '../common/extract-quality';
import { looksLikeGarbledLatinOcr } from '../common/garbled-latin-ocr';

const SIDEBAR_ACTIVITY =
  /jumbled order|correct words\.?\s*the first|compare your|fill in the blank|circle the|thing as true|something\s*$/i;

const REVERSED_OR_MIRROR =
  /\b[a-z]{0,2}\d+[A-Za-z]{2,}\b|\b[A-Za-z]{1,3}\d{3,}\)?|\b\d{5,}\)/;

function words(line: string): string[] {
  return line.match(/[A-Za-z]{2,}/g) ?? [];
}

function lineLooksLikeGibberish(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^Page\s+\d+$/i.test(trimmed)) return false;
  if (/^\*\*[^*]+\*\*$/.test(trimmed)) return false;
  if (trimmed.length >= 40 && /^[A-Z][a-z].*[.!?]"?\s*$/.test(trimmed)) return false;

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
    return keptBlocks.join('\n\n').trim();
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

/** After OCR/vision — reject pages that are still unusable (ask teacher to re-upload). */
export function isPagePhotoTextReadable(text: string | undefined | null): boolean {
  const value = (text ?? '').trim();
  const arabic = countArabicScriptChars(value);
  const minLen = arabic >= 30 ? 28 : 48;
  if (value.length < minLen) return false;
  if (looksLikeGarbledLatinOcr(value) && value.length < 220 && arabic < 40) return false;
  const blocks = value.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const good = blocks.filter((b) => !isSuspectParagraph(b));
  if (good.length === 0) return false;
  if (good.join(' ').replace(/\s+/g, ' ').split(' ').length < 8) return false;
  return true;
}
