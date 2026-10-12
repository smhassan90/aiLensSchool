import { fuseCellOcrCandidates, normalizeMathCellOcrText } from './ocr-math-cell-fusion';
import { strictCellExpressionMatches } from './ocr-diagnostic/evaluate-ground-truth';

describe('ocr-math-cell-fusion', () => {
  it('normalizeMathCellOcrText prefixes label', () => {
    expect(normalizeMathCellOcrText('1 2/5 ÷ 4/5', 'a')).toMatch(/^a\.\s/);
  });

  it('rejects label-only paddle output for cell e', () => {
    const fused = fuseCellOcrCandidates('e', [
      { engine: 'paddle', variant: 'upscale', rawText: 'e. 5', ms: 10 },
    ]);
    expect(fused).not.toBeNull();
    const body = fused!.text.replace(/^e\.\s*/i, '');
    expect(strictCellExpressionMatches(body, '12 3/5 ÷ 4 3/8')).toBe(false);
  });

  it('fuseCellOcrCandidates prefers fraction-like paddle text', () => {
    const fused = fuseCellOcrCandidates('a', [
      { engine: 'paddle', variant: 'upscale', rawText: 'a. 1 2/5 ÷ 4/5', ms: 10 },
      { engine: 'tesseract', variant: 'original', rawText: 'a. 12 + 4', ms: 8 },
    ]);
    expect(fused).not.toBeNull();
    const body = fused!.text.replace(/^a\.\s*/i, '');
    expect(strictCellExpressionMatches(body, '1 2/5 ÷ 4/5')).toBe(true);
  });
});
