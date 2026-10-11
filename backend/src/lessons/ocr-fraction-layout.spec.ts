import {
  formatStackedFractionBlock,
  pairFractionDigitRows,
  parseGluedDividendDivisor,
  reconstructGluedDivFractionChain,
  reconstructStackedFractionsInOcrText,
  reconstructWorkedFractionMathInOcrText,
  splitGluedDigitsToMatchCount,
} from './ocr-fraction-layout';
import { cleanMergedPageOcrText } from './science-ocr-clean';
import { mergePaddleAndTesseractPageOcr } from './merge-paddle-tesseract-ocr';

describe('ocr-fraction-layout', () => {
  it('pairs numerator/denominator digit rows into slash fractions', () => {
    expect(pairFractionDigitRows('3 8 6 9 10', '4 11 4 5 7')).toBe(
      '3/4, 8/11, 6/4, 9/5, 10/7',
    );
  });

  it('splits glued numerators to match denominator count', () => {
    expect(splitGluedDigitsToMatchCount('386910', 5)).toBe('3 8 6 9 10');
  });

  it('rebuilds Example fraction rows in page text', () => {
    const raw = `
You have already learnt:
about proper, improper, and mixed fractions
Example: 3 8 6 9 10
4 11 4 5 7
about like and unlike fractions
Example: 1 2 7 8 3 7 11 8
3 3 3 3 5 9 14 13
1 2 3 5
2 4 6 10 are equivalent fractions
`.trim();
    const out = reconstructStackedFractionsInOcrText(raw);
    expect(out).toMatch(/Example:\s*3\/4, 8\/11, 6\/4, 9\/5, 10\/7/);
    expect(out).toMatch(/Example:\s*1\/3, 2\/3, 7\/3, 8\/3, 3\/5, 7\/9, 11\/14, 8\/13/);
    expect(out).toMatch(/1\/2, 2\/4, 3\/6, 5\/10/);
  });

  it('rebuilds Paddle glued Example digit soup into slash fractions', () => {
    const raw = `
You have already learnt:
about proper, improper, and mixed fractions
Example3869102792
4'457613'
11
about like and unlike fractions
`.trim();
    const out = reconstructStackedFractionsInOcrText(raw);
    expect(out).toMatch(/3\/4/);
    expect(out).toMatch(/8\/11/);
    expect(out).toMatch(/6\/4/);
    expect(out).toMatch(/9\/5/);
    expect(out).toMatch(/10\/7/);
    expect(out).not.toMatch(/Example3869102792/);
  });

  it('cleanMergedPageOcrText runs fraction reconstruction on math pages', () => {
    const raw = `
MATH FLASH
about proper, improper, and mixed fractions
Example: 3 8 6 9 10
4 11 4 5 7
`.trim();
    const cleaned = cleanMergedPageOcrText(raw);
    expect(cleaned).toMatch(/3\/4, 8\/11/);
  });

  it('formatStackedFractionBlock draws numerator, bar, denominator', () => {
    const block = formatStackedFractionBlock('3', '4');
    expect(block.split('\n')).toHaveLength(3);
    expect(block).toMatch(/3/);
    expect(block).toMatch(/─/);
    expect(block).toMatch(/4/);
  });

  it('parseGluedDividendDivisor restores ÷ for any glued dividend+divisor', () => {
    expect(parseGluedDividendDivisor('363')).toBe('36÷3');
    expect(parseGluedDividendDivisor('484')).toBe('48÷4');
    expect(parseGluedDividendDivisor('152')).toBe('15÷2');
    expect(parseGluedDividendDivisor('7')).toBe('7');
  });

  it('rebuilds glued ÷ chains for a different number set than page fixtures', () => {
    // 36/48 → (36÷3)/(48÷3)=(12÷3)/(16÷3)=4/16 — proves not hardcoded to 28/40
    const chain = reconstructGluedDivFractionChain('363=123=4', '483 163 16');
    expect(chain).toMatch(/36÷3/);
    expect(chain).toMatch(/48÷3/);
    expect(chain).toMatch(/12÷3/);
    expect(chain).toMatch(/16÷3/);
    expect(chain).toMatch(/─/);
  });

  it('restores worked ÷ steps for an alternate reduce example (not one textbook page)', () => {
    const raw = `
Solution:
363=123=4
483
163
16
or we can divide directly by 4.
364=3
48412
2. 5 1/3 + 2 2/9
`.trim();
    const out = reconstructWorkedFractionMathInOcrText(raw);
    expect(out).toMatch(/36÷3/);
    expect(out).toMatch(/48÷3/);
    expect(out).toMatch(/36÷4/);
    expect(out).toMatch(/48÷4/);
    expect(out).toMatch(/5 1\/3 \+ 2 2\/9/);
    // Must not invent "Therefore…" prose that was never in the OCR.
    expect(out).not.toMatch(/Therefore/i);
  });

  it('merge prefers cleaner engine over duplicate-word soup (any page)', () => {
    const paddle = `
Now we will deal with addition, subtraction, multiplication, and
division of different types of fractions.
Solution:
363=123=4
483 163 16
`.trim();
    const tess = `
Now Now we will deal with addition, subtraction, multiplication, and
Now we will deal with additionsubtraction, multiplication and division of different types of fractions.
only only common factor
Reduce Reduce 2 to the lowest term. term
`.trim();
    const merged = mergePaddleAndTesseractPageOcr(paddle, tess);
    expect(merged).not.toMatch(/\bNow Now\b/);
    expect(merged).not.toMatch(/\bonly only\b/);
    expect(merged).toMatch(/36÷3/);
  });
});
