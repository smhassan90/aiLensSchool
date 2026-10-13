import {
  formatStackedFractionBlock,
  pairFractionDigitRows,
  parseGluedDividendDivisor,
  reconstructGluedDivFractionChain,
  formatGluedReduceEqualsChain,
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

  it('pairs trailing mixed numbers without gluing whole+num (92/11)', () => {
    // Book: 3/4, 8/11, 6/4, 9/5, 10/7, 2 1/6, 7 11/13, 9 2/11
    // OCR drops mixed numerators 1 and 11 → keep wholes; unglue 9 2/11.
    expect(pairFractionDigitRows('3869102792', "4'457613' 11")).toBe(
      '3/4, 8/11, 6/4, 9/5, 10/7, 2/6, 7/13, 9 2/11',
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
    expect(out).toMatch(
      /Example:\s*3\/4, 8\/11, 6\/4, 9\/5, 10\/7, 2\/6, 7\/13, 9 2\/11/,
    );
    expect(out).not.toMatch(/92\/11/);
    expect(out).not.toMatch(/Example3869102792/);
  });

  it('merge keeps Paddle Example fractions over Tess digit garble', () => {
    const paddle = `
MATH FLASH
You have already learnt:
about proper, improper, and mixed fractions
Example3869102792
4'457613'
11
about like and unlike fractions
`.trim();
    const tess = `
MATH FLASH
You have already learnt:
about proper, improper, and mixed fractions
Example: 8/4, 6/4, 9/5, 16/11, 2/7, 7/6, 92/13
about Like and unlike fractions
Example: 27/24, 83/6, 78/10
`.trim();
    const merged = mergePaddleAndTesseractPageOcr(paddle, tess);
    expect(merged).toMatch(/3\/4/);
    expect(merged).toMatch(/8\/11/);
    expect(merged).toMatch(/9 2\/11/);
    expect(merged).not.toMatch(/16\/11/);
    expect(merged).not.toMatch(/27\/24/);
    expect(merged).not.toMatch(/92\/1[13]/);
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

  it('formats glued reduce nums without equals signs', () => {
    expect(formatGluedReduceEqualsChain('2821427')).toBe('282=142=7');
    const raw = `
Solution:
2821427
402202 10
or we can divide directly by 4.
`.trim();
    const out = reconstructWorkedFractionMathInOcrText(raw);
    expect(out).toMatch(/28÷2/);
    expect(out).toMatch(/40÷2/);
    expect(out).toMatch(/7/);
    expect(out).toMatch(/10/);
  });

  it('derives final den from last ÷ den when OCR omits plain answer den', () => {
    const chain = reconstructGluedDivFractionChain('282=142=7', '402 202');
    expect(chain).toMatch(/28÷2/);
    expect(chain).toMatch(/40÷2/);
    expect(chain).toMatch(/14÷2/);
    expect(chain).toMatch(/20÷2/);
    expect(chain).toMatch(/7/);
    expect(chain).toMatch(/10/);
    expect(chain).not.toMatch(/20÷2\s*=\s*20÷2/);
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

  it('merge keeps Reduce 28/40 ÷ chain over Tess slash garble', () => {
    const paddle = `
Now we will deal with addition, subtraction, multiplication, and
division of different types of fractions.
Examples
1. Reduce 28/40 to the lowest term.
Solution:
282=142=7
402
202
10
or we can divide directly by 4.
284=7
404
10
Therefore, 28/40 in its lowest term is 7/10.
2. 4 2/5 + 7 1/10
=(4+7)+(2/5+1/10)
=11+5/10
=11+1/2
=11 1/2
REMEMBER
Do not forget to:
make the denominators same
reduce to the lowest term
`.trim();
    const tess = `
Examples:
Reduce 2 to the lowest term
Solution: 402 40/202
2/28, 8/4, 21/40, 4/4, 2/7, 7/10
or we can divide directly by 4.
Therefore, 2 28 in its lowest term is 7/10
REMEMBER
=4+7++
5 10 -1+2x31 Do not forget to
`.trim();
    const merged = mergePaddleAndTesseractPageOcr(paddle, tess);
    expect(merged).toMatch(/Reduce\s*28\/40/);
    expect(merged).toMatch(/28÷2/);
    expect(merged).toMatch(/40÷2/);
    expect(merged).toMatch(/4 2\/5 \+ 7 1\/10/);
    expect(merged).not.toMatch(/2\/28,\s*8\/4/);
    expect(merged).not.toMatch(/10\^-/);
    expect(merged).not.toMatch(/Reduce\s+2\s+to the lowest term/);
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
