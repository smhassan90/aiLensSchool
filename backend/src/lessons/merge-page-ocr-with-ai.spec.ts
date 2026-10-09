import {
  assembleChapterLessonFromPageTexts,
  stripWorkbookExercisesFromPage,
} from './merge-page-ocr-with-ai';

describe('stripWorkbookExercisesFromPage', () => {
  it('stops before Exercise 1', () => {
    const text = 'Reading text\nAkhtar came home.\n\nExercise 1\nWhat is the central idea?';
    expect(stripWorkbookExercisesFromPage(text)).toMatch(/Akhtar came home/);
    expect(stripWorkbookExercisesFromPage(text)).not.toMatch(/central idea/i);
  });
});

describe('assembleChapterLessonFromPageTexts', () => {
  it('joins page bodies without exercises', () => {
    const chapter = assembleChapterLessonFromPageTexts([
      'Page one story with enough lesson text here for assembly.',
      'Page two continues with more reading lines here.\n\nExercise 1\nSkip this.',
    ]);
    expect(chapter).toContain('Page one');
    expect(chapter).toContain('Page two');
    expect(chapter).not.toMatch(/central idea/i);
  });
});
