import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { mergePageOcr } from './ocr-layout-reconcile';
import { filterPageTextForLessonAssembly } from './page-text-sanitize';
import { applyExerciseGridFusion } from './ocr-exercise-grid-fusion';
import { normalizePix2TextPlain } from './ocr-pix2text-latex-plain';

const ROOT = join(process.cwd(), 'test-fixtures', 'fractions-chapter-calibration');
const IMAGE = join(ROOT, 'p57-divide-grid.jpg');
const PIX2_GRID = join(
  process.cwd(),
  'eval/specialized-math-ocr/outputs/p57-divide-grid__divide_grid__pix2text.txt',
);
const DATASET = JSON.parse(readFileSync(join(ROOT, 'chapter_dataset.json'), 'utf-8')) as {
  pages: Array<{
    id: string;
    exerciseItems: Array<{ label: string; text: string; reviewStatus: string }>;
  }>;
};

function cellMatches(label: string, body: string, expected: string): boolean {
  const t = normalizePix2TextPlain(`${label}. ${body}`).toLowerCase().replace(/\s/g, '');
  const e = normalizePix2TextPlain(expected).toLowerCase().replace(/\s/g, '');
  return t.includes(e) || e.split('÷').every((part) => t.includes(part.replace(/\s/g, '')));
}

describe('p57 divide grid regression (real image + real Pix2Text fixture)', () => {
  const refs = DATASET.pages.find((p) => p.id === 'p57-divide-grid')!.exerciseItems.filter(
    (e) => e.reviewStatus === 'reference',
  );

  it('fuses grid when Pix2Text fixture improves curated cells', async () => {
    if (!existsSync(IMAGE) || !existsSync(PIX2_GRID)) {
      return;
    }
    const buf = readFileSync(IMAGE);
    const sharp = require('sharp');
    const meta = await sharp(buf).metadata();
    const w = meta.width ?? 768;
    const h = meta.height ?? 1024;

    const paddle = '7. Divide the following fractions\nc. 325 d. 84\nReal-life Story Sums';
    const tesseract = '7. Divide the following fractions:\na. 12 +4\nReal-life Story Sums';
    const paddleLines = [
      {
        text: '7. Divide the following fractions',
        x0: 10,
        y0: 80,
        x1: 400,
        y1: 100,
        engine: 'paddle' as const,
      },
      {
        text: 'a. 12 +4',
        x0: 10,
        y0: 120,
        x1: 200,
        y1: 140,
        engine: 'paddle' as const,
      },
      {
        text: 'Real-life Story Sums',
        x0: 10,
        y0: 400,
        x1: 300,
        y1: 420,
        engine: 'paddle' as const,
      },
    ];

    const mergeC = filterPageTextForLessonAssembly(
      mergePageOcr({
        paddle,
        tesseract,
        paddleLines,
        tesseractLines: paddleLines,
        subjectName: 'Mathematics',
      }),
    );

    const pix2Raw = readFileSync(PIX2_GRID, 'utf-8');
    const worker = async (crops: Array<{ id: string; buffer: Buffer }>) => {
      const results = crops.map((c) => {
        if (c.id === 'divide_grid') {
          return { id: c.id, ok: true, text: pix2Raw, ms: 0 };
        }
        const label = c.id.replace('cell_', '');
        return { id: c.id, ok: true, text: pix2Raw, ms: 0 };
      });
      return { ok: true, results };
    };

    const out = await applyExerciseGridFusion({
      imageBuffer: buf,
      imageWidth: w,
      imageHeight: h,
      baseTranscript: mergeC,
      paddleLines,
      tesseractLines: paddleLines,
      runWorker: worker,
    });

    expect(out.applied).toBe(true);
    expect(storyContamination(out.text)).toBe(false);

    for (const ref of refs) {
      const cell = out.cells.find((c) => c.label === ref.label);
      expect(cell).toBeDefined();
      const body = (cell?.text ?? '').replace(/^[a-n]\.\s*/i, '');
      expect(cellMatches(ref.label, body, ref.text)).toBe(true);
    }
  });
});

function storyContamination(text: string): boolean {
  return /\breal[-\s]?life\b|\bstory\s+sums?\b/i.test(text);
}
