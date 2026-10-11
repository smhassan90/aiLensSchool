import {
  characterErrorRate,
  duplicateLineRate,
  exactExerciseItemMatch,
  snippetFoundInTranscript,
  wordErrorRate,
} from './ocr-calibration-metrics';

describe('ocr-calibration-metrics', () => {
  it('finds slash fractions with flexible spacing', () => {
    expect(snippetFoundInTranscript('8/11', 'Example: 3/4, 8 / 11, 6/4')).toBe(true);
  });

  it('computes CER', () => {
    expect(characterErrorRate('abc', 'abc')).toBe(0);
    expect(characterErrorRate('ab', 'abc')).toBeCloseTo(1 / 3, 5);
  });

  it('computes WER and duplicate line rate', () => {
    expect(wordErrorRate('a b c', 'a b c')).toBe(0);
    expect(duplicateLineRate('intro\nintro\nbody')).toBeGreaterThan(0);
  });

  it('matches exercise label + expression on unseen numbers', () => {
    const merged = 'a. 5 7/8 ÷ 3/4\nb. 2/9 ÷ 1/3';
    expect(exactExerciseItemMatch('a', '5 7/8 ÷ 3/4', merged)).toBe(true);
    expect(exactExerciseItemMatch('b', '2/9 ÷ 1/3', merged)).toBe(true);
    expect(exactExerciseItemMatch('a', '1 2/5 ÷ 4/5', merged)).toBe(false);
  });
});
