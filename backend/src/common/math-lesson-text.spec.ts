import {
  lineLooksLikeMathOrFormula,
  looksLikeMathScienceLessonText,
  tokenLooksLikeMathSymbol,
} from './math-lesson-text';

describe('math-lesson-text', () => {
  it('recognizes Greek and formula tokens as math symbols', () => {
    expect(tokenLooksLikeMathSymbol('λ')).toBe(true);
    expect(tokenLooksLikeMathSymbol('μ')).toBe(true);
    expect(tokenLooksLikeMathSymbol('×')).toBe(true);
    expect(tokenLooksLikeMathSymbol('the')).toBe(false);
  });

  it('detects physics formula lines', () => {
    expect(lineLooksLikeMathOrFormula('v = f × λ')).toBe(true);
    expect(lineLooksLikeMathOrFormula('f = 0.125 Hz')).toBe(true);
    expect(lineLooksLikeMathOrFormula('Akhtar smiled at Rukhsana.')).toBe(false);
  });

  it('detects physics lesson pages without set notation', () => {
    expect(
      looksLikeMathScienceLessonText(
        'Step 2 Write the formula. Wavelength λ = 8.0 m. Frequency 0.125 Hz. Wave speed v = f × λ.',
      ),
    ).toBe(true);
  });
});
