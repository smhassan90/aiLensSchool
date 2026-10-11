import { scoreFractionOcrText } from './ocr-math-region-recovery';

describe('ocr-math-region-recovery', () => {
  it('prefers slash fractions over digit soup', () => {
    expect(scoreFractionOcrText('28/40 = 7/10')).toBeGreaterThan(scoreFractionOcrText('2821427'));
  });
});
