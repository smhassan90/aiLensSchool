import { runMathCellPix2TextBatch } from './ocr-math-cell-pix2text';

describe('ocr-math-cell-pix2text', () => {
  const prev = process.env.OCR_PIX2TEXT_MATH_CROPS;

  afterEach(() => {
    if (prev === undefined) delete process.env.OCR_PIX2TEXT_MATH_CROPS;
    else process.env.OCR_PIX2TEXT_MATH_CROPS = prev;
  });

  it('returns disabled when feature flag off', async () => {
    process.env.OCR_PIX2TEXT_MATH_CROPS = '0';
    const r = await runMathCellPix2TextBatch({
      crops: [{ label: 'a', buffer: Buffer.from('x') }],
    });
    expect(r.enabled).toBe(false);
    expect(r.batches).toHaveLength(0);
  });

  it('isolates per-crop failures in batch results', async () => {
    process.env.OCR_PIX2TEXT_MATH_CROPS = '1';
    const runWorker = jest.fn().mockResolvedValue({
      ok: true,
      version: '1.1.7',
      loadMs: 10,
      results: [
        { id: 'a', ok: true, text: '$\\frac{1}{2}$', ms: 5 },
        { id: 'b', ok: false, text: '', ms: 1, error: 'bad_crop' },
      ],
    });
    const r = await runMathCellPix2TextBatch({
      crops: [
        { label: 'a', buffer: Buffer.from('a') },
        { label: 'b', buffer: Buffer.from('b') },
      ],
      runWorker,
    });
    expect(r.enabled).toBe(true);
    expect(runWorker).toHaveBeenCalledTimes(1);
    const rows = r.batches[0]?.rows ?? [];
    expect(rows.find((x) => x.label === 'a')?.ok).toBe(true);
    expect(rows.find((x) => x.label === 'b')?.ok).toBe(false);
  });
});
