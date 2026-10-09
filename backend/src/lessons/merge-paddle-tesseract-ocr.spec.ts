import {
  mergePaddleAndTesseractPageOcr,
  ocrLinesDuplicate,
  pickOcrMergePrimary,
} from './merge-paddle-tesseract-ocr';

describe('mergePaddleAndTesseractPageOcr', () => {
  it('dedupes near-duplicate lines and keeps paddle structure', () => {
    const paddle = 'Akhtar came home looking cross.\nUncle: Is it work that makes you cross?';
    const tess =
      'Akhtar came home looking cross.\nUncle: Is it work that makes you cross?';
    const merged = mergePaddleAndTesseractPageOcr(paddle, tess);
    expect(merged).toMatch(/Akhtar came home looking cross/);
    expect(merged.split('\n').filter(Boolean).length).toBe(2);
  });

  it('replaces garbage paddle tokens with tesseract words on the same line', () => {
    const paddle = 'Akhtar came ROT bel asked him the reason';
    const tess = 'Akhtar came home and asked him the reason';
    const merged = mergePaddleAndTesseractPageOcr(paddle, tess);
    expect(merged).toMatch(/Akhtar came home/i);
    expect(merged).not.toMatch(/\bROT\b/);
  });

  it('appends tesseract-only lines not present in paddle', () => {
    const paddle = 'Exercise 1';
    const tess = 'Exercise 1\nWhat is the central idea of the text?';
    const merged = mergePaddleAndTesseractPageOcr(paddle, tess);
    expect(merged).toMatch(/central idea/i);
  });

  it('uses tesseract as base when paddle is short and missing reading body', () => {
    const paddle = `
Pre-reading
Reading text
Dignity of Work
Uncle Inayat looked at him and asked him what had happened.
Akhtar
Uncle, we are having a social service week at school
25`.trim();
    const tess = `
Pre-reading
1. What are the two home chores you like to do, and why?
Reading text
Dignity of Work
Akhtar came home from school one day. He was feeling cross.
Akhtar's sister, Rukhsana, told Uncle Inayat that Akhtar had come home unhappy.
Uncle Inayat looked at him and asked him what had happened.
Akhtar Uncle, we are having a social service week at school, so we all have to do the work of servants and gardeners.
Uncle Is it work that makes you cross?
Akhtar Should I not be cross if I am made to work like a servant?
Uncle Did your teacher do anything himself?
Yes, he did. After taking out the desks and chairs, the headmaster swept the room and emptied the dustbin.
Is it a matter of shame to clean what we make dirty?
But think of the sweeper doing the bathroom.
`.trim();
    expect(pickOcrMergePrimary(paddle, tess)).toBe('tesseract');
    const merged = mergePaddleAndTesseractPageOcr(paddle, tess);
    expect(merged).toMatch(/Akhtar came home from school/i);
    expect(merged).toMatch(/feeling cross/i);
    expect(merged.length).toBeGreaterThan(paddle.length);
  });

  it('ocrLinesDuplicate treats high word overlap as duplicate', () => {
    expect(
      ocrLinesDuplicate(
        'Akhtar came home looking cross',
        'Akhtar came home looking very cross',
      ),
    ).toBe(true);
  });

  it('strips interleaved weblink sidebars from physics pages after merge', () => {
    const paddle = `
Step 2: Write down the formula
Encourage students to
T is the time taken
visit below link for
v = f × λ
https://www.youtube.com/watch?v=abc
Result = 1.0 m/s
wavelength of the waves are 8.0 m
`.trim();
    const tess = `
Step 2: Write down the formula
T is the time taken
v = f × λ
Result = 1.0 m/s
wavelength of the waves are 8.0 m
`.trim();
    const merged = mergePaddleAndTesseractPageOcr(paddle, tess);
    expect(merged).toMatch(/Step/i);
    expect(merged).toMatch(/λ|wavelength/i);
    expect(merged).not.toMatch(/youtube\.com/i);
    expect(merged).not.toMatch(/Encourage students/i);
  });

  it('keeps Greek lambda tokens instead of treating them as garbage', () => {
    const paddle = 'λ is the distance between the two consecutive crests\nv = f × λ';
    const tess = 'λ is the distance between the two consecutive crests\nv = f × λ';
    const merged = mergePaddleAndTesseractPageOcr(paddle, tess);
    expect(merged).toMatch(/λ/);
    expect(merged).toMatch(/v = f/);
  });
});
