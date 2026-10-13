import type { OcrStructuredLine } from './ocr-structured-line';
import { storyContamination } from './ocr-exercise-grid-cells';
import { detectUncertainMathRegions, type MathRegion } from './ocr-math-region-detect';
import { cropPageRegion } from './ocr-region-image-prep';
import {
  normalizePix2TextPlain,
  pix2textPlainForFusion,
} from './ocr-pix2text-latex-plain';
import {
  pix2textMathCropsEnabled,
  pix2textMaxCropDimensionPx,
  pix2textMaxRegionsPerPage,
  runPix2TextOnCrops,
  type Pix2TextCropResult,
} from './pix2text-math.runner';
import { hasDivideExerciseGridHeading } from './ocr-exercise-grid-crop';
import { applyExerciseGridFusion } from './ocr-exercise-grid-fusion';
import {
  scoreFractionOcrText,
  spliceRegionIntoTranscript,
  subjectEligibleForMathRegionRecovery,
} from './ocr-math-region-recovery';
import { cleanMergedPageOcrText, containsForeignScriptNoise } from './science-ocr-clean';

export type Pix2TextRegionOutput = {
  regionId: string;
  regionKind: string;
  rawMarkup: string;
  plainText: string;
  ms: number;
  ok: boolean;
  error?: string | null;
  box: { x0: number; y0: number; x1: number; y1: number };
};

export type Pix2TextMathFusionResult = {
  text: string;
  appliedRegions: string[];
  skippedRegions: string[];
  pix2textOutputs: Pix2TextRegionOutput[];
  skippedReason?: string;
  workerError?: string;
};

export function regionEligibleForPix2Text(region: MathRegion): boolean {
  if (region.kind === 'exercise_grid_band') return false;
  if (region.kind === 'solution_block') return true;
  return false;
}

function cropWithinLimits(region: MathRegion): boolean {
  const maxPx = pix2textMaxCropDimensionPx();
  const w = region.x1 - region.x0;
  const h = region.y1 - region.y0;
  if (w < 40 || h < 40) return false;
  if (w > maxPx || h > maxPx) return false;
  const area = w * h;
  const pageArea = region.pageWidth * region.pageHeight;
  if (pageArea > 0 && area / pageArea > 0.45) return false;
  return true;
}

export function pix2textExerciseGridPlausible(plain: string): boolean {
  const t = normalizePix2TextPlain(plain).toLowerCase();
  if (!t) return false;
  const labels = (t.match(/\b[a-n]\./g) ?? []).length;
  const fracs = (t.match(/\d+\s*\/\s*\d/g) ?? []).length;
  const divides = (t.match(/÷/g) ?? []).length;
  if (labels < 2 || fracs < 3) return false;
  if (divides < 1 && fracs < 4) return false;
  if (/\d{7,}/.test(t.replace(/\s/g, ''))) return false;
  return true;
}

export function pix2textSolutionPlausible(plain: string): boolean {
  const t = normalizePix2TextPlain(plain);
  if (!t) return false;
  if (!/\d\s*\/\s*\d/.test(t) && !/÷/.test(t)) return false;
  if (/\d{6,}/.test(t.replace(/\s/g, ''))) return false;
  if (/\\\s*\\/.test(plain) || /\\\\/.test(plain)) return false;
  if (/\barray\b/i.test(t) && /\b[a-z]\s+[a-z]\s+[a-z]/i.test(t)) return false;
  if (/\b[a-z]\s+[a-z]\s+[a-z]\s+[a-z]/i.test(t) && !/\d{2}/.test(t)) return false;
  return true;
}

function countStoryHeadings(text: string): number {
  return (text.match(/Real-life Story Sums/gi) ?? []).length;
}

function pix2textCandidateAcceptable(
  region: MathRegion,
  plain: string,
  baseTranscript: string,
): boolean {
  if (!plain.trim() || plain.length > 4000) return false;
  if (region.kind === 'exercise_grid_band') {
    return false;
  }
  if (region.kind === 'solution_block') {
    return pix2textSolutionPlausible(plain);
  }
  return false;
}

/**
 * Optional Pix2Text on bounded math crops + conservative splice into merged transcript.
 * Does not modify paddle/tesseract raw outputs.
 */
export async function applyPix2TextMathCropFusion(input: {
  imageBuffer: Buffer;
  imageWidth: number;
  imageHeight: number;
  baseTranscript: string;
  paddleLines?: OcrStructuredLine[];
  tesseractLines?: OcrStructuredLine[];
  subjectName?: string | null;
  runWorker?: typeof runPix2TextOnCrops;
}): Promise<Pix2TextMathFusionResult> {
  const base = (input.baseTranscript ?? '').trim();
  const empty: Pix2TextMathFusionResult = {
    text: base,
    appliedRegions: [],
    skippedRegions: [],
    pix2textOutputs: [],
  };

  if (!pix2textMathCropsEnabled()) {
    return { ...empty, skippedReason: 'disabled' };
  }
  if (!base || !input.imageBuffer?.length) {
    return { ...empty, skippedReason: 'empty_input' };
  }
  if (!subjectEligibleForMathRegionRecovery(input.subjectName)) {
    return { ...empty, skippedReason: 'subject' };
  }

  const combinedForHeading = [...(input.paddleLines ?? []), ...(input.tesseractLines ?? [])];
  if (hasDivideExerciseGridHeading(combinedForHeading, base)) {
    const gridFusion = await applyExerciseGridFusion({
      imageBuffer: input.imageBuffer,
      imageWidth: input.imageWidth,
      imageHeight: input.imageHeight,
      baseTranscript: base,
      paddleLines: input.paddleLines,
      tesseractLines: input.tesseractLines,
      runWorker: input.runWorker,
    });
    if (gridFusion.applied) {
      return {
        text: gridFusion.text,
        appliedRegions: ['exercise_grid_cells'],
        skippedRegions: gridFusion.uncertainLabels.map((l) => `cell_${l}`),
        pix2textOutputs: gridFusion.cells.map((c) => ({
          regionId: `cell_${c.label}`,
          regionKind: 'exercise_cell',
          rawMarkup: '',
          plainText: c.text,
          ms: 0,
          ok: true,
          error: null,
          box: gridFusion.gridCrop ?? { x0: 0, y0: 0, x1: 0, y1: 0 },
        })),
      };
    }
  }

  const allRegions = detectUncertainMathRegions({
    paddleLines: input.paddleLines,
    tesseractLines: input.tesseractLines,
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
  });

  const regions = allRegions
    .filter(regionEligibleForPix2Text)
    .filter((r) => r.kind !== 'exercise_grid_band')
    .filter(cropWithinLimits)
    .slice(0, pix2textMaxRegionsPerPage());

  if (!regions.length) {
    return { ...empty, skippedReason: 'no_eligible_regions' };
  }

  const worker = input.runWorker ?? runPix2TextOnCrops;
  const cropBuffers: Array<{ id: string; buffer: Buffer; region: MathRegion }> = [];

  for (const region of regions) {
    try {
      const buffer = await cropPageRegion(
        input.imageBuffer,
        { x0: region.x0, y0: region.y0, x1: region.x1, y1: region.y1 },
        'original',
      );
      cropBuffers.push({ id: region.id, buffer, region });
    } catch {
      // skip invalid crop
    }
  }

  if (!cropBuffers.length) {
    return { ...empty, skippedReason: 'crop_failed' };
  }

  const batch = await worker(
    cropBuffers.map((c) => ({ id: c.id, buffer: c.buffer })),
  );

  if (!batch.ok && !batch.results?.length) {
    return {
      ...empty,
      skippedReason: 'worker_unavailable',
      workerError: batch.error,
    };
  }

  const byId = new Map<string, Pix2TextCropResult>();
  for (const r of batch.results ?? []) {
    byId.set(r.id, r);
  }

  const pix2textOutputs: Pix2TextRegionOutput[] = [];
  let text = base;
  const appliedRegions: string[] = [];
  const skippedRegions: string[] = [];

  for (const { region } of cropBuffers) {
    const raw = byId.get(region.id);
    const rawMarkup = raw?.ok ? (raw.text ?? '').trim() : '';
    const plain = rawMarkup ? pix2textPlainForFusion(rawMarkup) : '';
    pix2textOutputs.push({
      regionId: region.id,
      regionKind: region.kind,
      rawMarkup,
      plainText: plain,
      ms: raw?.ms ?? 0,
      ok: Boolean(raw?.ok && plain),
      error: raw?.error,
      box: { x0: region.x0, y0: region.y0, x1: region.x1, y1: region.y1 },
    });

    if (!raw?.ok || !plain) {
      skippedRegions.push(region.id);
      continue;
    }
    if (!pix2textCandidateAcceptable(region, plain, text)) {
      skippedRegions.push(region.id);
      continue;
    }

    const before = text;
    const { text: merged, applied } = spliceRegionIntoTranscript(text, region, plain);
    if (!applied) {
      skippedRegions.push(region.id);
      continue;
    }
    const cleaned = cleanMergedPageOcrText(merged);
    const storyDup = countStoryHeadings(cleaned) - countStoryHeadings(before);
    const henceDup =
      (cleaned.match(/\bHence\b/gi) ?? []).length - (before.match(/\bHence\b/gi) ?? []).length;
    if (storyDup > 0 || henceDup > 0) {
      skippedRegions.push(region.id);
      continue;
    }
    if (containsForeignScriptNoise(cleaned) || containsForeignScriptNoise(plain)) {
      skippedRegions.push(region.id);
      continue;
    }
    if (scoreFractionOcrText(cleaned) < scoreFractionOcrText(before)) {
      skippedRegions.push(region.id);
      continue;
    }
    text = cleaned;
    appliedRegions.push(region.id);
  }

  return {
    text,
    appliedRegions,
    skippedRegions,
    pix2textOutputs,
    workerError: batch.error,
  };
}
