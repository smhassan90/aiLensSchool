import {
  compareOrientationOcrResults,
  englishPageTranscriptLooksIncomplete,
  filterPageTextForLessonAssembly,
  isPagePhotoTextReadable,
  mergeEnglishPageVisionWithOcr,
  PAGE_OCR_ACCEPT_THRESHOLD,
  pageHasStructuredLessonContent,
  scorePageOcrQuality,
  visionTranscriptMissingOcrContent,
} from './page-text-sanitize';
import { looksLikeGarbledLatinOcr } from '../common/garbled-latin-ocr';

describe('compareOrientationOcrResults', () => {
  it('prefers a clean upright transcript over a longer garbled rotation', () => {
    const garbled = `
hy? ;    to do, and w                   i
pre-reading      ho £570 home CHF   oe Jou don't want to do       VE
Akhtar came ROT bel asked him the reason
Note for teache  5    — wr     SrA of     10: Ask all
from 1.jpeg`.trim();
    const clean = `
Pre-reading
1. Why do you think Akhtar came home unhappy?
Reading text
Akhtar came home from school one day. He was feeling cross.
Uncle Inayat looked at him and asked him what had happened.`.trim();
    expect(looksLikeGarbledLatinOcr(garbled)).toBe(true);
    expect(looksLikeGarbledLatinOcr(clean)).toBe(false);
    const cmp = compareOrientationOcrResults(
      { text: garbled, score: 400, readable: true, degrees: 90 },
      { text: clean, score: 120, readable: true, degrees: 0 },
    );
    expect(cmp).toBeGreaterThan(0);
  });

  it('keeps upright electrostatics page over a longer sideways dump', () => {
    const upright = `
In this chapter, we will discuss the various characteristics of static charges.
14.1 Electric charge
Charge is a basic characteristic of matter that causes electrical processes.
Like charges repel each other
Opposite charges attract each other
Fig: 14.1 Electric charge`.trim();
    const sideways = `
fn this chapter, We ¥
of static charges,
oe © various characteristics
Additionally, everal appl ns of static electr
well as precautions against its use will be wiih
study of charges while they are not moving is referred i
ag electrostatics or static electricity
14.1 Electric charge
Charge is a basic characteristic of matter that causes
electrical processes. Charged particles are found in most
and some more filler text to make this longer than upright intentionally xxxxxxxx`.trim();
    const cmp = compareOrientationOcrResults(
      { text: upright, score: 200, readable: true, degrees: 0 },
      { text: sideways, score: 260, readable: true, degrees: 90 },
    );
    expect(cmp).toBeLessThan(0);
  });
});

describe('scorePageOcrQuality', () => {
  it('keeps readable poem OCR when paragraph filter would drop the stanza', () => {
    const noisyOcr = `
 HE VOICE OF GOD

oem is written by Louis I. Newman (189   y
1972). He was horn in Providence Rhode leland (USA).  \\
| He studied at Brown University and after his doctorate
jectured at Columbia. He is the author of many books
igious subject. This poem. brings ΓÇÿout his religious

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

  it('flags truncated King Bruce vision that stops at the title', () => {
    const vision = `9. Can a spider hurt us?

3. Can a spider teach us anything?

Reading text

King Bruce and the Spider`;
    expect(englishPageTranscriptLooksIncomplete(vision)).toBe(true);
  });

  it('keeps short-word verse lines like As grieved as man could be', () => {
    const line = 'As grieved as man could be,';
    const page = `READING COMPREHENSION\n\nHe flung himself down in a low despair,\n${line}\nAnd after a while he pondered there,`;
    const filtered = filterPageTextForLessonAssembly(page);
    expect(filtered).toContain('As grieved as man could be');
  });

  it('does not shred mid-poem stanzas on reading pages', () => {
    const ocr = `READING COMPREHENSION

For he had been trying to do a great deed,
To make his people glad;
He had tried and tried, but couldn't succeed,
And so became quite sad.

'Twas a long way up to the ceiling dome,
And it hung by a rope so fine,
That how it would get to its cobweb home
King Bruce could not divine.

"Bravo! bravo!" the King cried out;
"All honour to those who try;
The spider up there defied despair;
He conquered, and why should not I?"

And that time did not fail.`;
    const filtered = filterPageTextForLessonAssembly(ocr);
    expect(filtered).toMatch(/cobweb home/i);
    expect(filtered).toMatch(/Bravo/i);
    expect(filtered).toMatch(/time did not fail/i);
    expect(filtered.length).toBeGreaterThan(ocr.length * 0.85);
  });

  it('keeps mangled last poem line that OCR dropped a leading letter on', () => {
    const noisy = `Reading text
King Bruce and the Spider
Eliza Cook (1818-1889)

King Bruce of Scotland flung himself down
In a lonely mood to think;
'Tis true he was monarch and wore a crown,

ut his heart was beginning to sink.                        1`;
    const filtered = filterPageTextForLessonAssembly(noisy);
    expect(filtered).toMatch(/beginning to sink/i);
    expect(filtered).toMatch(/flung himself/i);
  });

  it('keeps pre-reading questions and poem title when filtering OCR', () => {
    const ocr = `pre-reading
1. Have you seen a spider? Are you afraid of it?

2. Can a spider hurt us?
3. Can a spider teach us anything?

Reading text

King Bruce and the Spider
Eliza Cook (1818-1889)

King Bruce of Scotland flung himself down
In a lonely mood to think;
'Tis true he was monarch and wore a crown,
But his heart was beginning to sink.`;
    const filtered = filterPageTextForLessonAssembly(ocr);
    expect(filtered).toMatch(/Have you seen a spider/i);
    expect(filtered).toMatch(/King Bruce and the Spider/i);
    expect(filtered).toMatch(/flung himself/i);
  });

  it('merges reading comprehension page when vision stops at the title', () => {
    const vision = `READING COMPREHENSION

1. Have you seen a spider? Are you afraid of it?
2. Can a spider hurt us?
3. Can a spider teach us anything?

Reading text

King Bruce and the Spider`;
    const ocr = `pre-reading
1. Have you seen a spider? Are you afraid of it?
Reading text
King Bruce and the Spider
Eliza Cook (1818-1889)
King Bruce of Scotland flung himself down
In a lonely mood to think;
'Tis true he was monarch and wore a crown,
But his heart was beginning to sink.`;
    expect(englishPageTranscriptLooksIncomplete(vision)).toBe(true);
    expect(visionTranscriptMissingOcrContent(vision, ocr)).toBe(true);
    const merged = mergeEnglishPageVisionWithOcr(vision, ocr);
    expect(merged).toMatch(/flung himself/i);
    expect(merged).toMatch(/beginning to sink/i);
  });

  it('keeps clean vision when English OCR is garbled (mixed Arabic quotes)', () => {
    const vision = `Pre-reading

1. What are home chores?
2. Guess the content relating to 'Dignity of Work'.

Akhtar came home looking cross. When his family asked him the reason, he did not answer.

Uncle: Is the sweeper not a human being?`;
    const ocr = `Pre-reading      ho £570 home CHF   oe Jou don't want to do       VE
Akhtar came ROT bel asked him the reason, he did not
and looked pn I ite | to find him. SO cross.`;
    const merged = mergeEnglishPageVisionWithOcr(vision, ocr);
    expect(merged).toMatch(/Akhtar came home looking cross/i);
    expect(merged).not.toMatch(/Akhtar came ROT/i);
  });

  it('detects when vision skipped poem body present in OCR', () => {
    const vision = `[This poem is written by Louis I. Newman (1893-1972). He was born in Providence Rhode Island (USA).]

Louis I. Newman

B. Exercise:
1. Why did author climb the steeple?`;
    const ocr = `THE VOICE OF GOD
I sought to hear the voice of God,
And climbed the topmost steeple,
A. Notes:
Line 2: steeple: the tallest part of a religious building.
B. Exercise:
1. Why did author climb the steeple?`;
    expect(visionTranscriptMissingOcrContent(vision, ocr)).toBe(true);
    const merged = mergeEnglishPageVisionWithOcr(vision, ocr);
    expect(merged).toMatch(/sought to hear/i);
    expect(merged).toMatch(/topmost steeple/i);
  });

  it('accepts vision partial capture with exercises when quality is below 90%', () => {
    const partial = `[This poem is written by Louis I. Newman (1893-1972). He was born in Providence Rhode Island (USA). He studied at Brown University and after his doctorate lectured at Columbia. He is the author of many books on religious subject. This poem brings out his religious bent of mind.]

Louis I. Newman

B. Exercise:
1. Why did author climb the steeple?
2. Why did God tell him to go down again?
3. Explain in your own words what you think is the message of this poem?`;
    expect(scorePageOcrQuality(partial)).toBeLessThan(PAGE_OCR_ACCEPT_THRESHOLD);
    expect(isPagePhotoTextReadable(partial)).toBe(true);
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
┬½One should have respect for all people who work.

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
a, school       b. factory ┬⌐. restaurant      d. government office
The son of a high US government official used to deliver newspapers
tobe, | ote
a. useful      b. independent ~~ ┬ó: dependent      d. punctual
|  5 | People in developed countries normally do
their own work.
BE   [Tn the present time, it is accepted that people | and another was 7. What lesso!
`.trim();
    expect(pageHasStructuredLessonContent(text)).toBe(false);
    expect(scorePageOcrQuality(text)).toBeLessThan(PAGE_OCR_ACCEPT_THRESHOLD);
    expect(isPagePhotoTextReadable(text)).toBe(false);
  });
});
