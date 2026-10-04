import {
  filterPageTextForLessonAssembly,
  isPagePhotoTextReadable,
  PAGE_OCR_ACCEPT_THRESHOLD,
  pageHasStructuredLessonContent,
  scorePageOcrQuality,
} from './page-text-sanitize';

describe('scorePageOcrQuality', () => {
  it('keeps readable poem OCR when paragraph filter would drop the stanza', () => {
    const noisyOcr = `
 HE VOICE OF GOD

oem is written by Louis I. Newman (189   y
1972). He was horn in Providence Rhode leland (USA).  \\
| He studied at Brown University and after his doctorate
jectured at Columbia. He is the author of many books
igious subject. This poem. brings ‘out his religious

[This p

on rel
bent of mind.]

| sought to hear the voice, of God,
And climbed the topmost: steeple,
But God declared: "Go down again,

1 dwell among the peoples

Line 2: stee:
building,

B. Exercise:

ple: the tall`.trim();
    expect(isPagePhotoTextReadable(noisyOcr)).toBe(true);
    const filtered = filterPageTextForLessonAssembly(noisyOcr);
    expect(isPagePhotoTextReadable(filtered)).toBe(true);
    expect(filtered).toMatch(/VOICE OF GOD|voice, of God/i);
    expect(filtered).toMatch(/steeple/i);
  });

  it('accepts poem and exercise page with decorative OCR noise', () => {
    const text = `
THE VOICE OF GOD

I sought to hear the voice of God,
And climbed the topmost steeple,
But God declared: "Go down again,
I dwell among the people."

Louis I. Newman

A. Notes:
Line 2: steeple: the tallest part of a religious building.

B. Exercise:
1. Why did author climb the steeple?
2. Why did God tell him to go down again?
3. Explain in your own words what you think is the message of this poem?
`.trim();
    expect(pageHasStructuredLessonContent(text)).toBe(true);
    expect(isPagePhotoTextReadable(text)).toBe(true);
  });

  it('accepts mostly clean exercise text', () => {
    const text = `
READING COMPREHENSION

Exercise 1
What do you think is the central idea of the text? From the options given below, tick the correct answer.
a. One should be ashamed of doing work.
b. One should be worried when asked to do work.
c. One should have respect for all people who work.

Exercise 2
Match column A words with their corresponding meaning in column B and write the answers in column C.
1) put in written form
2) treating everyone equally
3) showing kindness to workers

Exercise 3
Read the passage carefully and answer the questions that follow. The passage explains why respect for work matters in society.
Successful people believe that everyone who works honestly deserves dignity and fair treatment.
`.trim();
    expect(scorePageOcrQuality(text)).toBeGreaterThanOrEqual(PAGE_OCR_ACCEPT_THRESHOLD);
    expect(isPagePhotoTextReadable(text)).toBe(true);
  });

  it('flags noisy page with sidebar junk mixed into exercises', () => {
    const text = `
Unit.)        READING COMPREHENSION          2.1

Exercise 1
What do you think is the central idea of the text? From the options
given below, tick the correct answer.
2. One should be ashamed of doing work.
b. One should be worried when asked to do work.
«One should have respect for all people who work.

Exercise 2
Match column A words with their corresponding meaning in column
B and write the answers in column C. The first one has been done as an

1) put in written form

t treating everyone  ol on one of the page`.trim();
    expect(scorePageOcrQuality(text)).toBeLessThan(PAGE_OCR_ACCEPT_THRESHOLD);
  });

  it('rejects heavily damaged OCR with symbols and fragments', () => {
    const text = `
7. In China, it is mandatory for everyone to work in the field orina ___-
a, school       b. factory ©. restaurant      d. government office
The son of a high US government official used to deliver newspapers
tobe, | ote
a. useful      b. independent ~~ ¢: dependent      d. punctual
|  5 | People in developed countries normally do
their own work.
BE   [Tn the present time, it is accepted that people | and another was 7. What lesso!
`.trim();
    expect(pageHasStructuredLessonContent(text)).toBe(false);
    expect(scorePageOcrQuality(text)).toBeLessThan(PAGE_OCR_ACCEPT_THRESHOLD);
    expect(isPagePhotoTextReadable(text)).toBe(false);
  });
});
