import { sha256Buffer, sha256Text } from './hash';
import {
  evaluateCellsAgainstGroundTruth,
  scoreCellPrediction,
  evaluateCellsStrict,
  cellExpressionMatches,
  strictCellExpressionMatches,
} from './evaluate-ground-truth';
import { isOcrDiagnosticTestCaseAllowed } from './config';

describe('ocr-diagnostic hash', () => {
  it('sha256Buffer is stable', () => {
    const a = sha256Buffer(Buffer.from('abc'));
    const b = sha256Buffer(Buffer.from('abc'));
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('sha256Text is stable', () => {
    expect(sha256Text('hello')).toBe(sha256Text('hello'));
  });
});

describe('ocr diagnostic config', () => {
  const prevDiag = process.env.OCR_DIAGNOSTIC;
  const prevAllow = process.env.OCR_DIAGNOSTIC_ALLOWED_TEST_IDS;
  afterEach(() => {
    process.env.OCR_DIAGNOSTIC = prevDiag;
    process.env.OCR_DIAGNOSTIC_ALLOWED_TEST_IDS = prevAllow;
  });

  it('rejects unknown test ids when allowlist is set', () => {
    process.env.OCR_DIAGNOSTIC = '1';
    process.env.OCR_DIAGNOSTIC_ALLOWED_TEST_IDS = 'p57-divide-grid';
    expect(isOcrDiagnosticTestCaseAllowed('p57-divide-grid')).toBe(true);
    expect(isOcrDiagnosticTestCaseAllowed('other')).toBe(false);
    expect(isOcrDiagnosticTestCaseAllowed(undefined)).toBe(false);
  });
});

describe('evaluate-ground-truth', () => {
  it('cellExpressionMatches preserves fraction meaning', () => {
    expect(cellExpressionMatches('a. 1 2/5 ÷ 4/5', '1 2/5 ÷ 4/5')).toBe(true);
    expect(cellExpressionMatches('e. 5', '12 3/5 ÷ 4 3/8')).toBe(false);
    expect(strictCellExpressionMatches('e. 5', '12 3/5 ÷ 4 3/8')).toBe(false);
    expect(evaluateCellsStrict('e. 5', [{ label: 'e', text: '12 3/5 ÷ 4 3/8' }]).exactCellHits).toBe(0);
  });

  it('evaluateCellsAgainstGroundTruth counts hits', () => {
    const text = 'a. 1 2/5 ÷ 4/5\nb. 15/42 ÷ 5';
    const r = evaluateCellsAgainstGroundTruth(text, [
      { label: 'a', text: '1 2/5 ÷ 4/5' },
      { label: 'b', text: '15/42 ÷ 5' },
    ]);
    expect(r.exactCellHits).toBe(2);
    expect(r.missingLabels).toHaveLength(0);
  });

  it('scoreCellPrediction rejects partial expressions and label-only bodies', () => {
    const partial = scoreCellPrediction('e', '12 3/5 ÷ 4 3/8', '12 3/5 ÷');
    expect(partial.strictExpressionMatch).toBe(false);
    expect(partial.empty).toBe(false);
    const labelOnly = scoreCellPrediction('a', '1 2/5 ÷ 4/5', 'a.');
    expect(labelOnly.strictExpressionMatch).toBe(false);
    expect(labelOnly.labelVisible).toBe(true);
  });
});
