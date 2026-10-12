jest.mock('./ocr-region-image-prep', () => ({
  cropPageRegion: jest.fn().mockResolvedValue(Buffer.from('jpeg')),
}));

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { applyExerciseGridCellFusion } from './ocr-exercise-grid-fusion';
import type { OcrStructuredLine } from './ocr-structured-line';

const FIXTURE_PIX = join(
  process.cwd(),
  'eval/specialized-math-ocr/outputs/p57-divide-grid__divide_grid__pix2text.txt',
);

function line(text: string, y: number, x = 40): OcrStructuredLine {
  return { text, x0: x, y0: y, x1: x + 300, y1: y + 18, engine: 'paddle' };
}

describe('ocr-exercise-grid-fusion', () => {
  const base =
    '7. Divide the following fractions\n21/21, 66/6\nReal-life Story Sums\nIf 4 children ate...';

  it('skips when no divide heading', async () => {
    const r = await applyExerciseGridCellFusion({
      imageBuffer: Buffer.alloc(8),
      imageWidth: 768,
      imageHeight: 1024,
      baseTranscript: 'Chapter intro only',
      paddleLines: [line('Chapter intro', 10)],
      runWorker: jest.fn(),
    });
    expect(r.applied).toBe(false);
    expect(r.skippedReason).toBe('no_divide_heading');
  });

  it('rejects fusion when Pix2Text grid includes story text', async () => {
    const worker = jest.fn().mockResolvedValue({
      ok: true,
      results: [
        {
          id: 'divide_grid',
          ok: true,
          text: 'a. 1/2 ÷ 1/3 If 4 children ate ice cream',
          ms: 1,
        },
      ],
    });
    const lines = [
      line('7. Divide the following fractions', 90),
      line('Real-life Story Sums', 400),
    ];
    const r = await applyExerciseGridCellFusion({
      imageBuffer: Buffer.alloc(8),
      imageWidth: 768,
      imageHeight: 1024,
      baseTranscript: base,
      paddleLines: lines,
      tesseractLines: lines,
      runWorker: worker,
    });
    expect(r.applied).toBe(false);
    expect([
      'story_in_grid',
      'story_dup_after_splice',
      'no_cell_improvement',
      'insufficient_visible_labels',
      'too_few_cells',
    ]).toContain(r.skippedReason);
  });

  it('applies guarded fusion with real grid fixture Pix2Text (not mocked text)', async () => {
    if (!existsSync(FIXTURE_PIX)) {
      console.warn('skip: missing', FIXTURE_PIX);
      return;
    }
    const gridText = readFileSync(FIXTURE_PIX, 'utf-8');
    const worker = jest.fn().mockImplementation(async (crops: Array<{ id: string }>) => {
      const results = crops.map((c) => {
        if (c.id === 'divide_grid') {
          return { id: c.id, ok: true, text: gridText, ms: 10 };
        }
        if (c.id.startsWith('cell_')) {
          const label = c.id.replace('cell_', '');
          const m = new RegExp(`\\b${label}\\s*\\.`, 'i');
          if (m.test(gridText)) {
            return { id: c.id, ok: true, text: gridText, ms: 5 };
          }
        }
        return { id: c.id, ok: false, text: '', ms: 0 };
      });
      return { ok: true, results };
    });

    const lines = [
      line('7. Divide the following fractions', 95),
      line('a. 21/21', 140),
      line('b. 66/6', 165),
      line('e. 8 4/6', 220),
      line('n. 5/58', 280),
      line('Real-life Story Sums', 420),
    ];
    const r = await applyExerciseGridCellFusion({
      imageBuffer: Buffer.alloc(8),
      imageWidth: 768,
      imageHeight: 1024,
      baseTranscript: base,
      paddleLines: lines,
      tesseractLines: lines,
      runWorker: worker,
    });
    expect(r.applied).toBe(true);
    expect(r.text).toContain('a.');
    expect(r.text).toMatch(/2\/5|15\/42|12.*3\/5|8.*1\/4/);
    expect(r.text.match(/Real-life Story Sums/g)?.length).toBe(1);
    expect(r.text).not.toContain('21/21');
  });
});
