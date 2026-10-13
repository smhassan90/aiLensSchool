import {
  isOxfordFractionsWorkbookPage,
  mergeOxfordFractionsWorkbookPageOcr,
  shouldSkipOrientHintLessonBlend,
  tessFractionSlashSoup,
} from './ocr-fractions-workbook';

describe('ocr-fractions-workbook', () => {
  it('detects tess slash soup from live reduce page failures', () => {
    const bad = `
Reduce 2 to the lowest term
Solution: 402 40/202
2/28, 8/4, 21/40, 4/4, 2/7, 7/10
`.trim();
    expect(tessFractionSlashSoup(bad)).toBe(true);
  });

  it('skips orient blend when merged has ÷ chain and orient is tess soup', () => {
    const merged = 'Reduce 28/40\n28÷2 = 14÷2 = 7';
    const orient = 'Reduce 2 to the lowest term\n2/28, 8/4, 21/40';
    const paddle = 'Reduce 28.to the Lowest term\n2821427';
    expect(shouldSkipOrientHintLessonBlend(merged, orient, paddle)).toBe(true);
  });

  it('merge prefers paddle repair over tess soup on reduce page', () => {
    const paddle = `
Now we will deal with addition, subtraction, multiplication, and
division of different types of fractions.
Examples:
Reduce 28.to the Lowest term
40
Solution:
2821427
402202 10
`.trim();
    const tess = `
Reduce 2 to the lowest term
Solution: 402 40/202
2/28, 8/4, 21/40, 4/4, 2/7, 7/10
Therefore, 2 28 in its lowest term is 7/10
`.trim();
    const out = mergeOxfordFractionsWorkbookPageOcr(paddle, tess);
    expect(isOxfordFractionsWorkbookPage(out)).toBe(true);
    expect(out).toMatch(/Reduce\s+28\/40/);
    expect(out).toMatch(/28÷2/);
    expect(out).not.toMatch(/2\/28,\s*8\/4/);
    expect(out).not.toMatch(/Reduce\s+2\s+to the lowest term/);
  });

  it('merge prefers paddle when tess is column noise on add-fractions page', () => {
    const paddle = `
We can add and subtract more than two fractions with different
denominators in the same way.
Example:
1.3572 2. 3-323
Solution: Solution:
=3+5+7+ 28 =6-3-2+ 45, 30
Fractions
`.trim();
    const tess = `
eT                            ao pts:
135 Rh Li :     =
Solution:                            |     Solution:
= 15+ (34)
We can add and subtract more than two fractions with different 8
`.trim();
    const out = mergeOxfordFractionsWorkbookPageOcr(paddle, tess);
    expect(out).toMatch(/denominators in the same way/i);
    expect(out).toMatch(/Example:/i);
    expect(out).not.toMatch(/SL y oral/i);
    expect(out).not.toMatch(/Solution:\s*\|\s*Solution:/i);
  });
});
