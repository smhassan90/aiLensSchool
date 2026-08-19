const FAKE_EXTRACT =
  /transcribe every word|return chapter,?\s*topic|textbook photos for|photos were not saved|photographed textbook page|original photos were not saved|read the attached/i;

export function isFakeExtractText(text: string | undefined | null): boolean {
  const compact = (text ?? '').replace(/\s+/g, '');
  if (compact.length < 40) return true;
  return FAKE_EXTRACT.test((text ?? '').replace(/\s+/g, ' '));
}

export function looksLikeRealLessonText(text: string | undefined | null): boolean {
  return !isFakeExtractText(text);
}
