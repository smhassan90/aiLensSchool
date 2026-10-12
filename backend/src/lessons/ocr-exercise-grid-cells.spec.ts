import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  parseCellsFromGridPlain,
  pickBestCellCandidate,
  storyContamination,
  labelOrderValid,
  duplicateLabels,
} from './ocr-exercise-grid-cells';
import { normalizePix2TextPlain } from './ocr-pix2text-latex-plain';

const FIXTURE_PIX2 = join(
  process.cwd(),
  'eval/specialized-math-ocr/outputs/p57-divide-grid__divide_grid__pix2text.txt',
);

describe('ocr-exercise-grid-cells', () => {
  it('parses a–n cells from real p57 Pix2Text fixture (no mock)', () => {
    if (!existsSync(FIXTURE_PIX2)) {
      return;
    }
    const raw = readFileSync(FIXTURE_PIX2, 'utf-8');
    const cells = parseCellsFromGridPlain(raw);
    expect(cells.a).toBeDefined();
    expect(cells.b).toBeDefined();
    expect(cells.e).toBeDefined();
    expect(cells.n).toBeDefined();
    expect(storyContamination(cells.a ?? '')).toBe(false);

    const normA = normalizePix2TextPlain(cells.a ?? '').replace(/\s/g, '');
    expect(normA).toMatch(/12\/5/);
    expect(normA).toMatch(/4\/5/);
  });

  it('rejects story contamination in cell pick', () => {
    const picked = pickBestCellCandidate('a', [
      { source: 'paddle', text: 'a. If 4 children ate ice cream' },
      { source: 'pix2text', text: 'a. 1 2/5 ÷ 4/5' },
    ]);
    expect(picked?.source).toBe('pix2text');
    expect(storyContamination(picked?.text ?? '')).toBe(false);
  });

  it('validates label order and duplicates', () => {
    expect(labelOrderValid(['a', 'b', 'e'])).toBe(true);
    expect(labelOrderValid(['b', 'a'])).toBe(false);
    expect(duplicateLabels(['a', 'a'])).toBe(true);
  });
});
