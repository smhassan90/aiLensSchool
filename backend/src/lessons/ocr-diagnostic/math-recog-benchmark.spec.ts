import {
  classifyMathStructures,
  componentMetrics,
  scoreBenchmarkRow,
  summarizeStrictScores,
  type BenchmarkSample,
} from './math-recog-benchmark';

const baseSample: BenchmarkSample = {
  sampleId: 'p57-a-original',
  fixtureId: 'p57-divide-grid',
  expressionId: 'a',
  sourceImageSha256: 'x',
  cropSha256: 'y',
  cropMethod: 'ink_guided_6.7',
  scale: 'original',
  groundTruth: '1 2/5 ÷ 4/5',
  geometryCategory: 'verified_complete',
  structures: classifyMathStructures('1 2/5 ÷ 4/5'),
};

describe('math-recog-benchmark', () => {
  it('classifies math structures', () => {
    expect(classifyMathStructures('3 × 1/4 = 3/4').multiplication).toBe(true);
    expect(classifyMathStructures('12 3/5 ÷ 4 3/8').mixedNumber).toBe(true);
  });

  it('scores strict match without inferring missing divisor', () => {
    const row = scoreBenchmarkRow(baseSample, 'pix2text', '1 2/5 ÷4/5', null);
    expect(row.strictExpressionMatch).toBe(true);
    const partial = scoreBenchmarkRow(baseSample, 'pix2text', '1 2/5 ÷4', null);
    expect(partial.strictExpressionMatch).toBe(false);
    expect(partial.components.missingFractionParts.length).toBeGreaterThan(0);
  });

  it('detects hallucinated heading noise on b', () => {
    const b: BenchmarkSample = { ...baseSample, expressionId: 'b', groundTruth: '15/42 ÷ 5' };
    const row = scoreBenchmarkRow(b, 'pix2text', 'CEO b.', null);
    expect(row.hallucinatedLabel).toBe(true);
    expect(row.strictExpressionMatch).toBe(false);
  });

  it('summarizes with denominators', () => {
    const rows = [
      scoreBenchmarkRow(baseSample, 'm', '1 2/5 ÷4/5', null),
      scoreBenchmarkRow({ ...baseSample, sampleId: 'b', expressionId: 'b', groundTruth: '15/42 ÷ 5' }, 'm', 'x', null),
    ];
    const s = summarizeStrictScores(rows);
    expect(s.strictExpressionMatches).toBe(1);
    expect(s.total).toBe(2);
  });

  it('component metrics are deterministic', () => {
    const c = componentMetrics('8 1/4 ÷ 3 5/8', '8 1/4 ÷3');
    expect(c.missingFractionParts.some((p) => p.includes('5/8'))).toBe(true);
  });
});
