/**
 * Heuristics for low-quality Latin (English/Math) Tesseract output.
 * Also imported by the teacher portal (keep in sync).
 */

const ARABIC_SCRIPT =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;

const OCR_JUNK =
  /\b(?:SNUB|Udi|nid|Sib|ditt|SABA|Sot|Sure|smi|piso|fios|Kozel|BAG|NTL|MGI|IInd|DAB|FFF|STIRS|HLS|WHALES|PILL|PILLS|PUPS|Allie|poli|Sens|Vad|fife|PIETY|Ghat|Sih|SEs|LULL|PATS|onzNoslins|adainst|Loge|iyi|duldren)\b/gi;

const COMMON_ENGLISH_WORDS = new Set(
  `
  a about after all also an and are as at ask be been board but by call can children child complete
  differences every few finding flashcards for from get has have he her him his how i in is it its
  just like make many may me missing miss money more most my new not number numbers of on one or our
  out page paste places provide read said sequence series she similar specific stated take than that
  the their them then there these they this to too two up us use was we were what when which who
  will with would you your
  `
    .trim()
    .split(/\s+/),
);

function compactTextLength(text: string): number {
  return text.replace(/\s+/g, '').length;
}

function countArabicScriptChars(text: string): number {
  return (text.match(ARABIC_SCRIPT) ?? []).length;
}

function countLatinLetters(text: string): number {
  return (text.match(/[A-Za-z]/g) ?? []).length;
}

function countOcrJunkHits(text: string): number {
  return (text.match(OCR_JUNK) ?? []).length;
}

function looksLikeLatinGibberishLine(trimmed: string, words: string[]): boolean {
  if (!words.length) return true;
  const short = words.filter((w) => w.length <= 3).length;
  if (words.length <= 10 && short >= Math.ceil(words.length * 0.55)) return true;
  if (/[A-Za-z]\d|\d[A-Za-z]/.test(trimmed) && words.length <= 8) return true;
  if ((trimmed.match(/[)(@£€«»#|\\]/g) ?? []).length >= 1 && words.length <= 8 && short >= 3) {
    return true;
  }
  if (
    words.length <= 8 &&
    !/\b(?:the|and|of|in|is|are|to|for|with|missing|children|number|numbers|ask|read)\b/i.test(
      trimmed,
    ) &&
    short >= 3
  ) {
    return true;
  }
  return false;
}

function latinWordLooksPlausible(word: string): boolean {
  const w = word.toLowerCase();
  if (w.length <= 2) return true;
  if (COMMON_ENGLISH_WORDS.has(w)) return true;
  if (!/[aeiouy]/i.test(w)) return false;
  if (/[bcdfghjklmnpqrstvwxyz]{5,}/i.test(w)) return false;
  if (w.length >= 4 && w.length <= 12) {
    const vowels = (w.match(/[aeiouy]/gi) ?? []).length;
    if (vowels / w.length < 0.15) return false;
    return true;
  }
  return w.length <= 14;
}

/**
 * Decorative fonts, glare, and busy textbook layouts often produce long Latin
 * output that is not RTL-garbled but is still unusable.
 */
export function looksLikeGarbledLatinOcr(text: string | undefined | null): boolean {
  const value = (text ?? '').trim();
  if (compactTextLength(value) < 72) return false;

  const arabic = countArabicScriptChars(value);
  const latin = countLatinLetters(value);
  if (arabic >= 50 && arabic > latin) return false;

  if (countOcrJunkHits(value) >= 2) return true;

  const weirdPunct = (value.match(/[|\\[\]{}<>]{1,}/g) ?? []).length;
  const letterChars = Math.max(1, latin + arabic);
  if (weirdPunct >= 4 && weirdPunct / letterChars > 0.02) return true;

  const lines = value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let scoredLines = 0;
  let weakLines = 0;
  for (const line of lines) {
    if (/^Page\s+\d+$/i.test(line)) continue;
    if (countArabicScriptChars(line) >= 8) continue;
    const words = line.match(/[A-Za-z]{2,}/g) ?? [];
    if (words.length < 2 && countLatinLetters(line) < 12) continue;
    scoredLines += 1;
    if (countOcrJunkHits(line) > 0) {
      weakLines += 1;
      continue;
    }
    if (looksLikeLatinGibberishLine(line, words)) {
      weakLines += 1;
      continue;
    }
    const implausible = words.filter((w) => w.length >= 3 && !latinWordLooksPlausible(w));
    if (words.length >= 4 && implausible.length / words.length >= 0.45) {
      weakLines += 1;
    }
  }
  if (scoredLines >= 3 && weakLines / scoredLines >= 0.34) return true;

  const allWords = value.match(/[A-Za-z]{3,}/g) ?? [];
  if (allWords.length >= 14) {
    const bad = allWords.filter((w) => !latinWordLooksPlausible(w)).length;
    if (bad / allWords.length >= 0.38) return true;
  }

  return false;
}
