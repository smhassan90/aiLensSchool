const FAKE_EXTRACT =
  /transcribe every word|transcribe the attached|keep english as english|keep every urdu|original unicode script|not latin letters|preserve quran|return chapter,?\s*topic|textbook photos for|textbook page photo|photos were not saved|photographed textbook page|original photos were not saved|read the attached|content from the photos|content taken from \d+ photographed|could not read this lesson yet/i;

const ARABIC_SCRIPT =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;

const OCR_JUNK =
  /\b(?:SNUB|Udi|nid|Sib|ditt|SABA|Sot|Sure|smi|piso|fios|Kozel|BAG|NTL|MGI|IInd|DAB|FFF|STIRS|HLS|WHALES|PILL|PILLS|PUPS|Allie|poli|Sens|Vad|fife|PIETY|Ghat|Sih|SEs|LULL|PATS|onzNoslins|adainst)\b/gi;

export function compactTextLength(text: string | undefined | null): number {
  return (text ?? '').replace(/\s+/g, '').length;
}

export function isFakeExtractText(text: string | undefined | null): boolean {
  if (compactTextLength(text) < 40) return true;
  return FAKE_EXTRACT.test((text ?? '').replace(/\s+/g, ' '));
}

export function looksLikeRealLessonText(text: string | undefined | null): boolean {
  return !isFakeExtractText(text);
}

export function countArabicScriptChars(text: string): number {
  return (text.match(ARABIC_SCRIPT) ?? []).length;
}

export function countLatinLetters(text: string): number {
  return (text.match(/[A-Za-z]/g) ?? []).length;
}

function countOcrJunkHits(text: string): number {
  return (text.match(OCR_JUNK) ?? []).length;
}

/**
 * English / weak Urdu Tesseract often leaves Quran/Hadith lines as mixed
 * Latin junk + a few Arabic letters (e.g. "SNUB Ge) ... کے در مان").
 */
export function looksLikeMangledRtlOcr(text: string | undefined | null): boolean {
  const value = (text ?? '').trim();
  if (!value) return false;
  const arabic = countArabicScriptChars(value);
  const junkHits = countOcrJunkHits(value);
  const citesIslamicSource =
    /Qur['’]?an|Holy\s+Quran|Hadith|Hujjat|Bukhari|سورۃ|ترجمہ|Akhuwat|Hujat|Brotherhood|Equality/i.test(
      value,
    );

  // Junk tokens mean failed RTL OCR even when some Arabic Unicode slipped through.
  if (junkHits >= 2 && citesIslamicSource) return true;
  if (junkHits >= 3) return true;

  // ﷺ / name honorifics commonly collapse to broken forms.
  if (
    /(?:Muhammad|Quaid[\s-]?e[\s-]?Azam|Allama|Iqbal|Igbal|Prophet).{0,40}(?:«|»|\bele\b|\begle|\ballis\b|\bX55\b|\bFR\b\s*di|صل لله|#\d+|fos\s*صل)/i.test(
      value,
    )
  ) {
    return true;
  }

  const weirdTokens =
    value.match(
      /(?:^|\s)(?:[A-Za-z]{1,4}[)(@0-9£€«»]{1,5}|[)(@0-9£€«»]{1,4}[A-Za-z]{1,5}|[A-Za-z]{1,3}\d+[A-Za-z]{0,3})(?=\s|$|[«»])/g,
    ) ?? [];
  if (citesIslamicSource && weirdTokens.length >= 3 && arabic < 120) return true;

  const guillemets = (value.match(/[«»]/g) ?? []).length;
  if (guillemets >= 3 && arabic < 80) return true;

  if (weirdTokens.length >= 8 && arabic < 80) return true;

  // Arabic present but quote lines still look broken (short latin islands beside Arabic).
  if (
    citesIslamicSource &&
    arabic >= 20 &&
    weirdTokens.length >= 2 &&
    /[A-Za-z]{2,}\s*[\u0600-\u06FF]/.test(value)
  ) {
    return true;
  }

  return false;
}

/**
 * Tesseract often returns Nastaliq as a mix of broken Urdu + Latin junk.
 * English pages with short *clean* Urdu quotes are not treated as garbled.
 */
export function isGarbledRtlOcr(text: string | undefined | null): boolean {
  if (looksLikeMangledRtlOcr(text)) return true;
  const value = (text ?? '').trim();
  if (!value) return false;
  const arabic = countArabicScriptChars(value);
  if (arabic < 12) return false;
  const latin = countLatinLetters(value);
  const letterTotal = Math.max(1, latin + arabic);
  const arabicShare = arabic / letterTotal;
  const junkHits = countOcrJunkHits(value);
  if (junkHits >= 2) return true;
  // Mostly-RTL page polluted with Latin junk.
  if (arabicShare >= 0.35 && latin >= 20 && latin >= arabic * 0.25) return true;
  const latinChunks = value.match(/[A-Za-z]{2,}/g) ?? [];
  if (latinChunks.length >= 8 && arabicShare >= 0.35) return true;
  return false;
}

export function isUsableLessonOcr(
  text: string | undefined | null,
  options?: { expectArabicScript?: boolean },
): boolean {
  if (!looksLikeRealLessonText(text)) return false;
  if (isGarbledRtlOcr(text)) return false;
  if (options?.expectArabicScript) {
    if (countArabicScriptChars(text ?? '') < 20) return false;
  }
  return true;
}

/**
 * Keep readable English lines from a mixed page when Urdu/Arabic OCR failed.
 * Drops mangled RTL quote lines so the lesson is still usable for review.
 */
function looksLikeLatinGibberishLine(trimmed: string, words: string[]): boolean {
  if (!words.length) return true;
  const short = words.filter((w) => w.length <= 3).length;
  // "Sins Loh 2 ag A Lads id GD" / "Q9 Fed) en Sal ce pn)" / "LE lie nln JF Spline"
  if (words.length <= 10 && short >= Math.ceil(words.length * 0.55)) return true;
  if (/[A-Za-z]\d|\d[A-Za-z]/.test(trimmed) && words.length <= 8) return true;
  if ((trimmed.match(/[)(@£€«»#]/g) ?? []).length >= 1 && words.length <= 8 && short >= 3) {
    return true;
  }
  // Mostly consonant soup / no common English function words on short lines.
  if (
    words.length <= 8 &&
    !/\b(?:the|and|of|in|is|are|to|for|with|Islam|Muslim|Qur|Quran|Holy|brotherhood|equality|justice)\b/i.test(
      trimmed,
    ) &&
    short >= 3
  ) {
    return true;
  }
  return false;
}

export function englishOnlyFromMixedOcr(text: string | undefined | null): string {
  const value = (text ?? '').trim();
  if (!value) return '';
  const kept: string[] = [];
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      kept.push('');
      continue;
    }
    if (/^Page\s+\d+$/i.test(trimmed)) {
      kept.push(trimmed);
      continue;
    }
    const arabic = countArabicScriptChars(trimmed);
    const latin = countLatinLetters(trimmed);
    const junk = countOcrJunkHits(trimmed);
    const words = trimmed.match(/[A-Za-z]{2,}/g) ?? [];
    const weirdPunct = (trimmed.match(/[)(@£€«»#]{1,}/g) ?? []).length;
    if (junk > 0) continue;
    if (arabic >= 3) continue;
    if (latin < 12) continue;
    if (words.length < 3 && !/^(Equality|Brotherhood|Sovereignty|Justice)\b/i.test(trimmed)) {
      continue;
    }
    // Drop low-quality OCR debris posing as English.
    if (latin / Math.max(1, trimmed.replace(/\s+/g, '').length) < 0.55) continue;
    if (weirdPunct >= 2) continue;
    if (/^(?:ترجمہ|سورۃ|\(ترجمہ)/.test(trimmed)) continue;
    if (
      /(?:Muhammad|Prophet|Quaid).{0,48}(?:«|»|\bFR\b\s*di|\bX55\b|صل لله|#\d+|fos\s*صل|fos\s+dir|\bdir,)/i.test(
        trimmed,
      )
    ) {
      continue;
    }
    if (looksLikeLatinGibberishLine(trimmed, words)) continue;
    if (/^(?:On another occasion|Our beloved Prophet|Hazrat Muhammad)\b/i.test(trimmed) && words.length < 10) {
      // Incomplete honorific lines without real sentence content.
      if (!/\bsaid\b/i.test(trimmed) || /fos|dir,|FR\b|X55|\d\s+fos/i.test(trimmed)) continue;
    }
    // Empty quote intros with no following English content on the same line.
    if (
      /^(?:The Holy Qur['’]?an says:|Itis also said in the Holy Quran:|It is also said in the Holy Quran:|The Holy-Quran says:|Has did said:)\s*$/i.test(
        trimmed,
      )
    ) {
      continue;
    }
    kept.push(trimmed);
  }
  let out = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  out = out
    .replace(
      /(?:The Holy Qur['’]?an says:|Itis also said in the Holy Quran:|It is also said in the Holy Quran:|The Holy-Quran says:)\s*(?=\n(?:Equality|Brotherhood|In Islamic|The fundamental|Our beloved|On another|In short|[A-Z])|\n*$)/gi,
      '',
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (compactTextLength(out) < 120) return '';
  return out;
}

/** Prefer the full page over a short AI rewrite. */
export function longestRealLessonText(...texts: Array<string | undefined | null>): string {
  const real = texts.filter(
    (text): text is string => looksLikeRealLessonText(text) && !isGarbledRtlOcr(text),
  );
  if (!real.length) return texts.find((text) => (text ?? '').trim())?.trim() ?? '';
  return real.sort((a, b) => compactTextLength(b) - compactTextLength(a))[0];
}
