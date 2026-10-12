import { readEnv } from '../common/env';
import {
  pix2textMathCropsEnabled,
  pix2textMaxCropDimensionPx,
  runPix2TextOnCrops,
  type Pix2TextBatchResult,
} from './pix2text-math.runner';
import { pix2textPlainForFusion, normalizePix2TextPlain } from './ocr-pix2text-latex-plain';
import type { ExerciseCellLabel } from './ocr-exercise-grid-cells';

export type MathCellPix2TextVariant = 'original' | 'upscale2x';

export type MathCellPix2TextRow = {
  label: ExerciseCellLabel;
  variant: MathCellPix2TextVariant;
  rawLatex: string;
  plainForFusion: string;
  normalizedPlain: string;
  ok: boolean;
  error?: string | null;
  inferenceMs: number;
  cropSha256?: string;
};

export function mathCellPix2TextUpscaleEnabled(): boolean {
  return readEnv('OCR_MATH_CELL_PIX2TEXT_UPSCALE') === '1';
}

async function upscale2xLanczos(buf: Buffer): Promise<Buffer> {
  const sharpModule = await import('sharp');
  const sharp =
    (sharpModule as { default?: (i: Buffer) => import('sharp').Sharp }).default ??
    (sharpModule as unknown as (i: Buffer) => import('sharp').Sharp);
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const maxPx = pix2textMaxCropDimensionPx();
  const nw = Math.min(Math.round(w * 2), maxPx);
  const nh = Math.min(Math.round(h * 2), maxPx);
  return sharp(buf)
    .resize({ width: nw, height: nh, kernel: 'lanczos3', fit: 'inside' })
    .jpeg({ quality: 92 })
    .toBuffer();
}

function variantsForRequest(): MathCellPix2TextVariant[] {
  const out: MathCellPix2TextVariant[] = ['original'];
  if (mathCellPix2TextUpscaleEnabled()) out.push('upscale2x');
  return out;
}

/**
 * Pix2Text on multiple math-cell crops in one worker per variant batch.
 * Disabled unless OCR_PIX2TEXT_MATH_CROPS=1.
 */
export async function runMathCellPix2TextBatch(input: {
  crops: Array<{ label: ExerciseCellLabel; buffer: Buffer }>;
  runWorker?: typeof runPix2TextOnCrops;
}): Promise<{
  enabled: boolean;
  pythonNote?: string;
  batches: Array<{
    variant: MathCellPix2TextVariant;
    batch: Pix2TextBatchResult;
    rows: MathCellPix2TextRow[];
  }>;
}> {
  if (!pix2textMathCropsEnabled()) {
    return { enabled: false, batches: [] };
  }

  const worker = input.runWorker ?? runPix2TextOnCrops;
  const batches: Array<{
    variant: MathCellPix2TextVariant;
    batch: Pix2TextBatchResult;
    rows: MathCellPix2TextRow[];
  }> = [];

  for (const variant of variantsForRequest()) {
    const prepared: Array<{ id: string; buffer: Buffer; label: ExerciseCellLabel }> = [];
    for (const c of input.crops) {
      let buf = c.buffer;
      if (variant === 'upscale2x') {
        buf = await upscale2xLanczos(c.buffer);
      }
      prepared.push({ id: c.label, buffer: buf, label: c.label });
    }

    const batch = await worker(prepared.map((p) => ({ id: p.id, buffer: p.buffer })));
    const byId = new Map((batch.results ?? []).map((r) => [r.id, r]));
    const rows: MathCellPix2TextRow[] = prepared.map((p) => {
      const row = byId.get(p.label);
      const rawLatex = row?.text ?? '';
      const plain = rawLatex ? pix2textPlainForFusion(rawLatex) : '';
      return {
        label: p.label,
        variant,
        rawLatex,
        plainForFusion: plain,
        normalizedPlain: plain ? normalizePix2TextPlain(plain) : '',
        ok: Boolean(row?.ok && rawLatex.trim()),
        error: row?.error ?? (batch.ok ? null : batch.error),
        inferenceMs: row?.ms ?? 0,
      };
    });

    batches.push({ variant, batch, rows });
  }

  return { enabled: true, batches };
}

export function mathCellPix2TextCandidatesForFusion(
  label: ExerciseCellLabel,
  rows: MathCellPix2TextRow[],
): Array<{ engine: 'pix2text'; variant: 'original'; rawText: string; ms: number }> {
  const prefer = rows.find((r) => r.label === label && r.variant === 'upscale2x' && r.ok);
  const fallback = rows.find((r) => r.label === label && r.variant === 'original' && r.ok);
  const pick = prefer ?? fallback;
  if (!pick?.plainForFusion.trim()) return [];
  return [
    {
      engine: 'pix2text',
      variant: 'original',
      rawText: pick.plainForFusion,
      ms: pick.inferenceMs,
    },
  ];
}
