import { readEnv } from '../common/env';
import { runPaddleOcrOnBuffer, paddleOcrEnabled } from './paddle-ocr.runner';
import { cropPageRegion, type RegionPreprocessVariant } from './ocr-region-image-prep';

export type CellOcrCandidate = {
  engine: 'paddle' | 'tesseract' | 'pix2text';
  variant: RegionPreprocessVariant | 'original';
  rawText: string;
  ms: number;
  error?: string;
};

const DEFAULT_VARIANTS: RegionPreprocessVariant[] = ['upscale', 'contrast', 'original'];

export function mathCellOcrVariants(): RegionPreprocessVariant[] {
  const raw = readEnv('OCR_MATH_CELL_VARIANTS');
  if (!raw?.trim()) return DEFAULT_VARIANTS;
  const allowed = new Set<RegionPreprocessVariant>(['original', 'grayscale', 'upscale', 'contrast']);
  const parsed = raw
    .split(',')
    .map((s) => s.trim() as RegionPreprocessVariant)
    .filter((v) => allowed.has(v));
  return parsed.length ? parsed.slice(0, 4) : DEFAULT_VARIANTS;
}

let tessWorkerPromise: Promise<{
  recognize: (buf: Buffer) => Promise<string>;
  terminate: () => Promise<void>;
}> | null = null;

async function getTessBatchWorker(): Promise<{
  recognize: (buf: Buffer) => Promise<string>;
  terminate: () => Promise<void>;
}> {
  if (!tessWorkerPromise) {
    tessWorkerPromise = (async () => {
      const tesseract = await import('tesseract.js');
      const worker = await tesseract.createWorker('eng', 1, { logger: () => undefined });
      return {
        recognize: async (buf: Buffer) => {
          const { data } = await worker.recognize(buf);
          return (data.text ?? '').trim();
        },
        terminate: () => worker.terminate(),
      };
    })();
  }
  return tessWorkerPromise;
}

export async function releaseMathCellTesseractWorker(): Promise<void> {
  if (tessWorkerPromise) {
    const w = await tessWorkerPromise;
    await w.terminate();
    tessWorkerPromise = null;
  }
}

export async function ocrMathCellCrop(input: {
  imageBuffer: Buffer;
  box: { x0: number; y0: number; x1: number; y1: number };
  subjectName?: string;
  variants?: RegionPreprocessVariant[];
}): Promise<CellOcrCandidate[]> {
  const variants = input.variants ?? mathCellOcrVariants();
  const out: CellOcrCandidate[] = [];
  const tess = await getTessBatchWorker();

  for (const variant of variants) {
    const t0 = Date.now();
    let crop: Buffer;
    try {
      crop = await cropPageRegion(input.imageBuffer, input.box, variant);
    } catch {
      continue;
    }

    if (paddleOcrEnabled()) {
      const tP = Date.now();
      const paddle = await runPaddleOcrOnBuffer(
        { buffer: crop, mimetype: 'image/jpeg', originalname: `cell-${variant}.jpg` },
        { subjectName: input.subjectName },
      );
      if (paddle.text.trim()) {
        out.push({
          engine: 'paddle',
          variant,
          rawText: paddle.text.trim(),
          ms: Date.now() - tP,
        });
      }
    }

    const tT = Date.now();
    try {
      const tessText = await tess.recognize(crop);
      if (tessText.trim()) {
        out.push({
          engine: 'tesseract',
          variant,
          rawText: tessText,
          ms: Date.now() - tT,
        });
      }
    } catch (err) {
      out.push({
        engine: 'tesseract',
        variant,
        rawText: '',
        ms: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return out;
}
