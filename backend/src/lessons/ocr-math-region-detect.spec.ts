import { detectUncertainMathRegions } from './ocr-math-region-detect';
import type { OcrStructuredLine } from './ocr-structured-line';

describe('ocr-math-region-detect', () => {
  it('clusters digit-soup lines into a region', () => {
    const paddleLines: OcrStructuredLine[] = [
      { text: '2821427', x0: 100, y0: 500, x1: 200, y1: 530, engine: 'paddle' },
      { text: '402202 10', x0: 100, y0: 540, x1: 220, y1: 570, engine: 'paddle' },
    ];
    const regions = detectUncertainMathRegions({
      paddleLines,
      imageWidth: 1200,
      imageHeight: 1600,
    });
    expect(regions.length).toBeGreaterThan(0);
    expect(regions.some((r) => r.kind === 'digit_soup' || r.kind === 'stacked_fraction_band')).toBe(
      true,
    );
  });

  it('detects exercise band from divide heading bbox', () => {
    const lines: OcrStructuredLine[] = [
      {
        text: '7. Divide the following fractions',
        x0: 50,
        y0: 100,
        x1: 400,
        y1: 140,
        engine: 'paddle',
      },
      { text: '25', x0: 80, y0: 160, x1: 100, y1: 190, engine: 'paddle' },
      { text: '45', x0: 80, y0: 200, x1: 100, y1: 230, engine: 'paddle' },
    ];
    const regions = detectUncertainMathRegions({
      paddleLines: lines,
      imageWidth: 1000,
      imageHeight: 1400,
    });
    expect(regions.some((r) => r.kind === 'exercise_grid_band')).toBe(true);
  });
});
