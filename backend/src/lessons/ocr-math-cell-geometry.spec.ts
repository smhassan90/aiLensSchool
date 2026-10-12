import { boxesOverlap, padCellBox } from './ocr-math-cell-geometry';

describe('ocr-math-cell-geometry', () => {
  it('padCellBox stays in page bounds', () => {
    const padded = padCellBox({ x0: 10, y0: 10, x1: 100, y1: 80 }, 8, 500, 600);
    expect(padded.x0).toBeGreaterThanOrEqual(0);
    expect(padded.y1).toBeLessThanOrEqual(600);
  });

  it('boxesOverlap detects substantial overlap', () => {
    const a = { x0: 0, y0: 0, x1: 100, y1: 50 };
    const b = { x0: 50, y0: 0, x1: 150, y1: 50 };
    expect(boxesOverlap(a, b, 0.3)).toBe(true);
  });
});
