import {
  mergePaddleAndTesseractPageOcr,
  ocrLinesDuplicate,
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

  it('ocrLinesDuplicate treats high word overlap as duplicate', () => {
    expect(
      ocrLinesDuplicate(
        'Akhtar came home looking cross',
        'Akhtar came home looking very cross',
      ),
    ).toBe(true);
  });
});
