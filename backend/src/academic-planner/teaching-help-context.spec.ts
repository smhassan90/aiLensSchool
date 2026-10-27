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
      bookTitle: null,
    });
    expect(result.basis).toBe('OBJECTIVES_ONLY');
    expect(result.chapterExcerpt).toBe('');
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
      bookTitle: null,
    });
    expect(result.basis).toBe('UNAVAILABLE');
  });
});
