jest.mock('./ocr-region-image-prep', () => ({
  cropPageRegion: jest.fn().mockResolvedValue(Buffer.from('crop-bytes')),
}));

import type { MathRegion } from './ocr-math-region-detect';
import {
  applyPix2TextMathCropFusion,
  pix2textExerciseGridPlausible,
  regionEligibleForPix2Text,
} from './ocr-pix2text-math-fusion';
import { pix2textMathCropsEnabled } from './pix2text-math.runner';
import { latexFracToPlain, normalizePix2TextPlain } from './ocr-pix2text-latex-plain';
import type { OcrStructuredLine } from './ocr-structured-line';

const gridPlain =
  'a. 1 2/5 ÷ 4/5 b. 15/42 ÷ 5 c. 37/25 ÷ 1/75 e. 12 3/5 ÷ 4 3/8 n. 8 1/4 ÷ 3 5/8';

function line(text: string, y: number): OcrStructuredLine {
  return { text, x0: 10, y0: y, x1: 400, y1: y + 20, engine: 'paddle' };
}

describe('ocr-pix2text-latex-plain', () => {
  it('converts frac and div without collapsing distinct expressions', () => {
    const a = normalizePix2TextPlain('$1 \\frac{2}{5} \\div \\frac{4}{5}$');
    const b = normalizePix2TextPlain('$\\frac{15}{42} \\div 5$');
    expect(a).toContain('2/5');
    expect(a).toContain('÷');
    expect(b).toContain('15/42');
    expect(a).not.toBe(b);
  });

  it('collapses spaced digits inside numbers', () => {
    expect(latexFracToPlain('1 2 3')).toBe('123');
  });
});

describe('ocr-pix2text-math-fusion', () => {
  const prevPix2 = process.env.OCR_PIX2TEXT_MATH_CROPS;
  const prevRetry = process.env.OCR_MATH_REGION_RETRY;

  afterEach(() => {
    process.env.OCR_PIX2TEXT_MATH_CROPS = prevPix2;
    process.env.OCR_MATH_REGION_RETRY = prevRetry;
  });

  it('flag disabled: worker is never called', async () => {
    process.env.OCR_PIX2TEXT_MATH_CROPS = '0';
    const worker = jest.fn();
    const buf = Buffer.from('fake');
    await applyPix2TextMathCropFusion({
      imageBuffer: buf,
      imageWidth: 768,
      imageHeight: 1024,
      baseTranscript: 'hello',
      subjectName: 'Mathematics',
      runWorker: worker,
    });
    expect(worker).not.toHaveBeenCalled();
    expect(pix2textMathCropsEnabled()).toBe(false);
  });

  it('flag enabled: eligible grid invokes worker', async () => {
    process.env.OCR_PIX2TEXT_MATH_CROPS = '1';
    const worker = jest.fn().mockResolvedValue({
      ok: true,
      results: [{ id: 'exercise_band', ok: true, text: gridPlain, ms: 10 }],
    });
    const paddleLines = [
      line('7. Divide the following fractions', 80),
      line('21/21, 66/6', 120),
    ];
    const base =
      '7. Divide the following fractions\n21/21, 66/6\nReal-life Story Sums\nIf 4 children ate...';
    const result = await applyPix2TextMathCropFusion({
      imageBuffer: Buffer.alloc(100),
      imageWidth: 768,
      imageHeight: 1024,
      baseTranscript: base,
      paddleLines,
      tesseractLines: paddleLines,
      subjectName: 'Mathematics',
      runWorker: worker,
    });
    expect(worker).toHaveBeenCalledTimes(1);
    expect(result.appliedRegions).toContain('exercise_band');
    expect(result.text).toContain('15/42');
    expect(result.text).not.toContain('21/21');
    expect((result.text.match(/Real-life Story Sums/g) ?? []).length).toBe(1);
  });

  it('does not send ordinary prose-only pages to worker when no math region', async () => {
    process.env.OCR_PIX2TEXT_MATH_CROPS = '1';
    const worker = jest.fn();
    await applyPix2TextMathCropFusion({
      imageBuffer: Buffer.alloc(100),
      imageWidth: 768,
      imageHeight: 1024,
      baseTranscript: 'Chapter one\nOnce upon a time there was a river.',
      paddleLines: [line('Chapter one', 10), line('Once upon a time', 40)],
      subjectName: 'Mathematics',
      runWorker: worker,
    });
    expect(worker).not.toHaveBeenCalled();
  });

  it('empty worker output falls back to base', async () => {
    process.env.OCR_PIX2TEXT_MATH_CROPS = '1';
    const base = '7. Divide the following fractions\nbad\nReal-life Story Sums';
    const worker = jest.fn().mockResolvedValue({
      ok: true,
      results: [{ id: 'exercise_band', ok: true, text: '   ', ms: 1 }],
    });
    const lines = [line('7. Divide the following fractions', 80), line('bad', 120)];
    const result = await applyPix2TextMathCropFusion({
      imageBuffer: Buffer.alloc(100),
      imageWidth: 768,
      imageHeight: 1024,
      baseTranscript: base,
      paddleLines: lines,
      subjectName: 'Mathematics',
      runWorker: worker,
    });
    expect(result.text).toBe(base);
    expect(result.appliedRegions).toHaveLength(0);
  });

  it('worker timeout/unavailable falls back', async () => {
    process.env.OCR_PIX2TEXT_MATH_CROPS = '1';
    const base = '7. Divide the following fractions\nx\nReal-life Story Sums';
    const worker = jest.fn().mockResolvedValue({
      ok: false,
      results: [],
      error: 'Pix2Text timed out after 120000ms',
    });
    const lines = [line('7. Divide the following fractions', 80)];
    const result = await applyPix2TextMathCropFusion({
      imageBuffer: Buffer.alloc(100),
      imageWidth: 768,
      imageHeight: 1024,
      baseTranscript: base,
      paddleLines: lines,
      subjectName: 'Mathematics',
      runWorker: worker,
    });
    expect(result.text).toBe(base);
    expect(result.skippedReason).toBe('worker_unavailable');
  });

  it('malformed worker batch falls back', async () => {
    process.env.OCR_PIX2TEXT_MATH_CROPS = '1';
    const worker = jest.fn().mockResolvedValue({ ok: false, results: [], error: 'malformed_json' });
    const lines = [line('7. Divide the following fractions', 80)];
    const result = await applyPix2TextMathCropFusion({
      imageBuffer: Buffer.alloc(100),
      imageWidth: 768,
      imageHeight: 1024,
      baseTranscript: '7. Divide the following fractions\nbad',
      paddleLines: lines,
      subjectName: 'Mathematics',
      runWorker: worker,
    });
    expect(result.appliedRegions).toHaveLength(0);
  });

  it('rejects grid pix2text that bleeds story heading', async () => {
    process.env.OCR_PIX2TEXT_MATH_CROPS = '1';
    const bloated = `${gridPlain}\nReal-life Story Sums\nIf 4 children ate ice cream `.repeat(3);
    const worker = jest.fn().mockResolvedValue({
      ok: true,
      results: [{ id: 'exercise_band', ok: true, text: bloated, ms: 1 }],
    });
    const lines = [line('7. Divide the following fractions', 80)];
    const base = '7. Divide the following fractions\nbad\nReal-life Story Sums\nstory';
    const result = await applyPix2TextMathCropFusion({
      imageBuffer: Buffer.alloc(100),
      imageWidth: 768,
      imageHeight: 1024,
      baseTranscript: base,
      paddleLines: lines,
      subjectName: 'Mathematics',
      runWorker: worker,
    });
    expect(result.appliedRegions).toHaveLength(0);
  });

  it('region eligibility filters prose clusters', () => {
    const prose: MathRegion = {
      id: 'r1',
      kind: 'low_confidence_line',
      x0: 0,
      y0: 0,
      x1: 100,
      y1: 50,
      pageWidth: 768,
      pageHeight: 1024,
      sourceLineTexts: ['hello'],
      uncertainReason: 'low',
      priority: 1,
    };
    expect(regionEligibleForPix2Text(prose)).toBe(false);
    expect(pix2textExerciseGridPlausible(gridPlain)).toBe(true);
  });
});
