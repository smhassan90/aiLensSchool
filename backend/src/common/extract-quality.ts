const FAKE_EXTRACT =
  /transcribe every word|return chapter,?\s*topic|textbook photos for|photos were not saved|photographed textbook page|original photos were not saved|read the attached/i;

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

/** Prefer the full page over a short AI rewrite. */
export function longestRealLessonText(...texts: Array<string | undefined | null>): string {
  const real = texts.filter((text): text is string => looksLikeRealLessonText(text));
  if (!real.length) return texts.find((text) => (text ?? '').trim())?.trim() ?? '';
  return real.sort((a, b) => compactTextLength(b) - compactTextLength(a))[0];
}