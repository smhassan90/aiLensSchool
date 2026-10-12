import { strictCellExpressionMatches } from './ocr-diagnostic/evaluate-ground-truth';
import {
  collapseSpacedDigits,
  latexFracToPlain,
  normalizePix2TextPlain,
  pix2textPlainForFusion,
  stripPix2TextExerciseLabelPrefix,
} from './ocr-pix2text-latex-plain';

describe('ocr-pix2text-latex-plain mixed numbers', () => {
  it('preserves mixed number before simple fraction', () => {
    expect(latexFracToPlain('1 \\frac{2}{5}')).toBe('1 2/5');
    expect(
      strictCellExpressionMatches(
        normalizePix2TextPlain('$1 \\frac{2}{5} \\div \\frac{4}{5}$'),
        '1 2/5 ÷ 4/5',
      ),
    ).toBe(true);
  });

  it('still collapses spaced single-digit OCR noise when not a mixed number', () => {
    expect(collapseSpacedDigits('1 2 3')).toBe('123');
  });

  it('does not merge whole and fraction parts of a mixed number', () => {
    const raw = '\n$$\n0 . 1 \\frac{2} {5} \\div\\frac{4} {5}\n$$\n';
    const plain = pix2textPlainForFusion(raw);
    expect(plain).toContain('1 2/5');
    expect(plain).not.toMatch(/12\/5/);
  });

  it('strips exercise label prefix without inventing operands', () => {
    expect(stripPix2TextExerciseLabelPrefix('e . 12 3/5 ÷')).toBe('12 3/5 ÷');
  });

  it('leaves ambiguous spaced digits without fraction slash unchanged when not protected', () => {
    expect(collapseSpacedDigits('9 8')).toBe('98');
  });
});
