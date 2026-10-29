import { resolveTeachingHelpContext } from './teaching-help-context';

describe('resolveTeachingHelpContext', () => {
  it('uses CHAPTER_TEXT when excerpt is long enough', () => {
    const text = 'A'.repeat(200);
    const result = resolveTeachingHelpContext({
      lessonTitle: 'L1',
      objectives: ['Obj'],
      portionKeys: [],
      chapterTitle: 'Ch 1',
      contentHash: 'h',
      libraryBookChapterId: 'lib-1',
      analysis: null,
      chapterText: text,
      packSummary: null,
      bookTitle: 'Book',
    });
    expect(result.basis).toBe('CHAPTER_TEXT');
    expect(result.excerptCharCount).toBeGreaterThanOrEqual(80);
  });

  it('falls back to OBJECTIVES_ONLY when excerpt is short', () => {
    const result = resolveTeachingHelpContext({
      lessonTitle: 'L1',
      objectives: ['Understand fractions'],
      portionKeys: [],
      chapterTitle: 'Ch 1',
      contentHash: 'h',
      libraryBookChapterId: 'lib-1',
      analysis: null,
      chapterText: 'short',
      packSummary: null,
      bookTitle: null,
    });
    expect(result.basis).toBe('OBJECTIVES_ONLY');
  });

  it('uses pack summary when chapter text is short', () => {
    const result = resolveTeachingHelpContext({
      lessonTitle: 'L1',
      objectives: ['Read with class'],
      portionKeys: ['role:intro'],
      chapterTitle: 'Ch 1',
      contentHash: 'h',
      libraryBookChapterId: 'lib-1',
      analysis: null,
      chapterText: 'short',
      packSummary: 'B'.repeat(200),
      bookTitle: null,
    });
    expect(result.basis).toBe('CHAPTER_TEXT');
    expect(result.excerptCharCount).toBeGreaterThanOrEqual(80);
  });

  it('is UNAVAILABLE without objectives or text', () => {
    const result = resolveTeachingHelpContext({
      lessonTitle: 'L1',
      objectives: [],
      portionKeys: [],
      chapterTitle: 'Ch 1',
      contentHash: null,
      libraryBookChapterId: null,
      analysis: null,
      chapterText: null,
      packSummary: null,
      bookTitle: null,
    });
    expect(result.basis).toBe('UNAVAILABLE');
  });
});
