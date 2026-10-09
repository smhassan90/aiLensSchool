import {
  assembleChapterLessonFromPageTexts,
  buildGroundedStoryOpening,
  groundEnglishReadingMerge,
  pickStrongerRuleMerge,
  stripWorkbookExercisesFromPage,
} from './merge-page-ocr-with-ai';
import { mergePaddleAndTesseractPageOcr } from './merge-paddle-tesseract-ocr';

describe('pickStrongerRuleMerge', () => {
  it('does not prefer short clean paddle over fuller combined rule', () => {
    const paddle = `
Pre-reading
Dignity of Work
Uncle Inayat looked at him.
Akhtar: Uncle, we are having a social service week at school.
25`.trim();
    const tess = `
Pre-reading
Dignity of Work
Akhtar came home from school one day. He was feeling cross and looked untidy.
Akhtar's sister, Rukhsana, told Uncle Inayat that Akhtar had come home unhappy.
Uncle Inayat looked at him and asked him what had happened.
Akhtar Uncle, we are having a social service week at school, so we all have to do the work of servants and gardeners.
Uncle Is it work that makes you cross?
Should I not be cross if I am made to work like a servant?
Did your teacher do anything himself?
Yes he did. The headmaster emptied the dustbin.
Is it a matter of shame to clean what we make dirty?
`.trim();
    const rule = mergePaddleAndTesseractPageOcr(paddle, tess);
    const picked = pickStrongerRuleMerge(paddle, tess, rule);
    expect(picked).toMatch(/Akhtar came home/i);
    expect(picked.length).toBeGreaterThan(paddle.length);
  });
});

describe('groundEnglishReadingMerge', () => {
  const paddle = `
Unit
Pre-reading
I. What are the two home chores you like to do, and why?
Guess the content of the text.
Reading tert
Dignity of Work
down to lunch, the children's favourite uncle, Mr.Inayat, came to visit
them.Children were very happy to see him because he had been to
many countries and always told them interesting stories.
Akhtar's sister Rukhsana, told Uncle Inayat that Akhtar had come
home unhappy.
Akhtar
Uncle,we are having a social service week at school, so we
all have to do the work of servants and gardeners.
Uncle
Is it work that makes you cross?
`.trim();

  const tess = `
Akhtar came home late from scl
feeling CLOSS
looked untidy
MI Inayat, came to visit
interesting stories
social service week
`.trim();

  it('repairs invented opening and keeps Akhtar came home', () => {
    const badAi = `
Pre-reading
Name some home chores you don't want to do.
Reading text
Dignity of Work
One day he was feeling cross because he did not want to go down to lunch. They were very happy to see him because he had been to many countries and always told them interesting stories.

Akhtar's sister, Rukhsana, told Uncle Inayat that Akhtar had come home unhappy.

Akhtar: Uncle, we are having a social service week at school, so we all have to do the work of servants and gardeners.
Uncle: Is it work that makes you cross?
`.trim();
    const grounded = groundEnglishReadingMerge(badAi, paddle, tess);
    expect(grounded).toMatch(/Akhtar came home/i);
    expect(grounded).not.toMatch(/did not want to go down to lunch/i);
    expect(grounded).toMatch(/two home chores you like/i);
    expect(grounded).toMatch(/social service week/i);
    expect(buildGroundedStoryOpening(paddle, tess)).toMatch(/Akhtar came home late from school/i);
  });
});

describe('stripWorkbookExercisesFromPage', () => {
  it('stops before Exercise 1 on story pages', () => {
    const text =
      'Reading text\nAkhtar came home late from school one day and told uncle about social service week.\n\nExercise 1\nWhat is the central idea?';
    expect(stripWorkbookExercisesFromPage(text)).toMatch(/Akhtar came home/);
    expect(stripWorkbookExercisesFromPage(text)).not.toMatch(/central idea/i);
  });

  it('keeps exercise-only worksheet pages instead of collapsing to Unit', () => {
    const text = `
Unit
READING COMPREHENSION
2.1
Exercise 1
What do you think is the central idea of the text?
a. One should be ashamed of doing work.
b. One should be worried when asked to do work.
c. One should have respect for all people who work.
Exercise 2
Match column A words with their corresponding meaning in column B.
1. cross
2. fetch
`.trim();
    const kept = stripWorkbookExercisesFromPage(text);
    expect(kept).toMatch(/Exercise 1/i);
    expect(kept).toMatch(/central idea/i);
    expect(kept).toMatch(/Match column A/i);
    expect(kept.length).toBeGreaterThan(80);
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
