/** Prefer Urdu/Arabic packs for Islamiat and related subjects. */
export function ocrLanguagesForSubject(subjectName?: string | null): string {
  const name = (subjectName ?? '').toLowerCase();
  if (
    /islam|islamiyat|urdu|arabic|nazra|nazira|qaida|quran|qur.?an|sindhi|قرآن|اسلام|اردو/.test(
      name,
    )
  ) {
    return 'eng+urd+ara';
  }
  return 'eng';
}

export function isEnglishPrimarySubject(subjectName?: string | null): boolean {
  return ocrLanguagesForSubject(subjectName) === 'eng';
}
