import {
  inkGuidedCellsToRegions,
  mathCellInkGuidedEnabled,
  refineDivideCellsWithInkGuidance,
} from './ocr-math-cell-ink-guided';
import type { MathCellRegion } from './ocr-math-cell-layout';

async function loadSharp(): Promise<(input?: import('sharp').SharpOptions) => import('sharp').Sharp> {
  const sharpModule = await import('sharp');
  return (
    (sharpModule as { default?: (input?: import('sharp').SharpOptions) => import('sharp').Sharp })
      .default ?? (sharpModule as unknown as (input?: import('sharp').SharpOptions) => import('sharp').Sharp)
  );
}

async function synthPageWithInkRects(
  rects: Array<{ x0: number; y0: number; x1: number; y1: number }>,
): Promise<Buffer> {
  const sharp = await loadSharp();
  const w = 400;
  const h = 200;
  const base = await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 220, g: 220, b: 220 } },
  })
    .jpeg()
    .toBuffer();
  const overlays: Array<{ input: Buffer; left: number; top: number }> = [];
  for (const r of rects) {
    overlays.push({
      input: await sharp({
        create: {
          width: Math.max(1, r.x1 - r.x0),
          height: Math.max(1, r.y1 - r.y0),
          channels: 3,
          background: { r: 20, g: 20, b: 20 },
        },
      })
        .png()
        .toBuffer(),
      left: r.x0,
      top: r.y0,
    });
  }
  const fromBuffer = sharp as unknown as (input: Buffer) => import('sharp').Sharp;
  return fromBuffer(base).composite(overlays).jpeg().toBuffer();
}

describe('ocr-math-cell-ink-guided', () => {
  it('expands nominal box to include wide ink within column gutter', async () => {
    const img = await synthPageWithInkRects([
      { x0: 20, y0: 40, x1: 28, y1: 55 },
      { x0: 35, y0: 42, x1: 120, y1: 54 },
    ]);
    const nominal: MathCellRegion[] = [
      {
        label: 'a',
        box: { x0: 18, y0: 38, x1: 70, y1: 58 },
        detection: 'fixture_calibration',
        confidence: 0.9,
        uncertain: false,
      },
      {
        label: 'b',
        box: { x0: 150, y0: 38, x1: 220, y1: 58 },
        detection: 'fixture_calibration',
        confidence: 0.9,
        uncertain: false,
      },
    ];
    const refined = await refineDivideCellsWithInkGuidance({
      imageBuffer: img,
      pageWidth: 400,
      pageHeight: 200,
      gridBox: { x0: 10, y0: 30, x1: 380, y1: 170 },
      nominalCells: nominal,
    });
    const a = refined.find((r) => r.label === 'a');
    expect(a).toBeDefined();
    expect(a!.semanticBox.x1).toBeGreaterThan(70);
    expect(a!.semanticBox.x1).toBeLessThan(150);
  });

  it('maps ink-guided results to regions', () => {
    const regions = inkGuidedCellsToRegions([
      {
        label: 'e',
        nominalBox: { x0: 0, y0: 0, x1: 10, y1: 10 },
        semanticBox: { x0: 0, y0: 0, x1: 40, y1: 10 },
        status: 'complete_with_whitespace',
        reasons: [],
        inkBounds: { x0: 1, y0: 1, x1: 38, y1: 9 },
        diagnostics: { inkPixelCount: 100, rightGutterPx: 5, nextColumnX0: 50 },
      },
    ]);
    expect(regions[0].detection).toBe('ink_guided');
    expect(regions[0].box.x1).toBe(40);
  });

  it('feature flag is off by default', () => {
    delete process.env.OCR_MATH_CELL_INK_GUIDED;
    expect(mathCellInkGuidedEnabled()).toBe(false);
  });

  it('falls back to nominal box on contamination risk', () => {
    const regions = inkGuidedCellsToRegions([
      {
        label: 'n',
        nominalBox: { x0: 10, y0: 10, x1: 50, y1: 30 },
        semanticBox: { x0: 8, y0: 10, x1: 200, y1: 30 },
        status: 'neighbor_contamination_risk',
        reasons: ['wide_expansion'],
        inkBounds: { x0: 8, y0: 10, x1: 199, y1: 29 },
        diagnostics: { inkPixelCount: 50, rightGutterPx: 0, nextColumnX0: null },
      },
    ]);
    expect(regions[0].box.x1).toBe(50);
    expect(regions[0].uncertain).toBe(true);
  });
});
