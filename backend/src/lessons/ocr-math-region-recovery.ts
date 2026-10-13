import { readEnv } from '../common/env';
import { runPaddleOcrOnBuffer } from './paddle-ocr.runner';
import { cleanMergedPageOcrText, containsForeignScriptNoise } from './science-ocr-clean';
import type { OcrStructuredLine } from './ocr-structured-line';
import { detectUncertainMathRegions, type MathRegion } from './ocr-math-region-detect';
import { cropPageRegion, type RegionPreprocessVariant } from './ocr-region-image-prep';
import { ocrLanguagesForSubject } from './ocr-subject-lang';

export type RegionOcrCandidate = {
  regionId: string;
  variant: RegionPreprocessVariant;
  engine: 'paddle' | 'tesseract';
  text: string;
  lines: OcrStructuredLine[];
};

export type MathRegionRecoveryResult = {
  text: string;
  appliedRegions: string[];
  uncertainRegions: string[];
  candidates: RegionOcrCandidate[];
  skippedReason?: string;
};

export function mathRegionRecoveryEnabled(): boolean {
  return readEnv('OCR_MATH_REGION_RETRY') === '1';
}

export function maxMathRegionsPerPage(): number {
  const n = Number(readEnv('OCR_MATH_REGION_MAX') ?? 6);
  return Math.min(12, Math.max(0, Number.isFinite(n) ? n : 6));
}

export function maxVariantsPerRegion(): number {
  const n = Number(readEnv('OCR_MATH_REGION_VARIANTS') ?? 2);
  return Math.min(4, Math.max(1, Number.isFinite(n) ? n : 2));
}

export function subjectEligibleForMathRegionRecovery(subjectName?: string | null): boolean {
  const n = (subjectName ?? '').toLowerCase();
  if (/islam|urdu|arabic|nazra|qaida|quran|sindhi/.test(n)) return false;
  if (/math|physics|chemistry|science|stem/.test(n)) return true;
  return false;
}

const VARIANT_ORDER: RegionPreprocessVariant[] = ['upscale', 'contrast', 'original', 'grayscale'];

/** Exported for tests / evaluation metrics. */
export function scoreFractionOcrText(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  let s = 0;
  s += (t.match(/\d\s*\/\s*\d/g) ?? []).length * 4;
  s += (t.match(/÷/g) ?? []).length * 3;
  s += (t.match(/\d\s*÷\s*\d/g) ?? []).length * 2;
  if (/\d{7,}/.test(t.replace(/\s/g, ''))) s -= 8;
  if ((t.match(/\|/g) ?? []).length > 3) s -= 4;
  if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(t)) s -= 40;
  return s;
}

function recoveryImprovesLine(oldLine: string, newBlock: string): boolean {
  const old = oldLine.trim();
  const neu = newBlock.trim();
  if (!neu || neu.length > 800) return false;
  const oldSig = scoreFractionOcrText(old);
  const newSig = scoreFractionOcrText(neu);
  if (newSig > oldSig + 1) return true;
  const oldDigits = old.replace(/\D/g, '').length;
  if (oldDigits >= 6 && DIGIT_SOUP.test(old.replace(/\s/g, '')) && newSig >= oldSig) return true;
  return false;
}

const DIGIT_SOUP = /\d{6,}/;

function pickBestCandidate(candidates: RegionOcrCandidate[]): RegionOcrCandidate | null {
  if (!candidates.length) return null;
  return [...candidates].sort(
    (a, b) => scoreFractionOcrText(b.text) - scoreFractionOcrText(a.text),
  )[0];
}

async function recognizeTesseractCrop(
  buffer: Buffer,
  subjectName?: string | null,
): Promise<{ text: string; lines: OcrStructuredLine[] }> {
  const languages = ocrLanguagesForSubject(subjectName);
  const tesseract = await import('tesseract.js');
  const worker = await tesseract.createWorker(languages, 1, { logger: () => {} });
  try {
    const mime = 'image/jpeg';
    const source = `data:${mime};base64,${buffer.toString('base64')}`;
    await worker.setParameters({
      tessedit_pageseg_mode: String(tesseract.PSM.SINGLE_BLOCK),
    });
    const result = await worker.recognize(source);
    const { tesseractLinesFromRecognizeData } = await import('./tesseract-structured');
    const text = (result.data.text ?? '').replace(/\u000c/g, '').trim();
    const lines = tesseractLinesFromRecognizeData(result.data).map((l) => ({
      ...l,
      engine: 'tesseract' as const,
    }));
    return { text, lines };
  } finally {
    await worker.terminate();
  }
}

async function ocrRegionVariants(
  imageBuffer: Buffer,
  region: MathRegion,
  subjectName?: string | null,
  tessEnabled = true,
): Promise<RegionOcrCandidate[]> {
  const variants = VARIANT_ORDER.slice(0, maxVariantsPerRegion());
  const out: RegionOcrCandidate[] = [];
  const box = { x0: region.x0, y0: region.y0, x1: region.x1, y1: region.y1 };

  for (const variant of variants) {
    const crop = await cropPageRegion(imageBuffer, box, variant);
    const file = {
      buffer: crop,
      mimetype: 'image/jpeg',
      originalname: `${region.id}-${variant}.jpg`,
    };
    const paddle = await runPaddleOcrOnBuffer(file, {
      subjectName,
      timeoutMs: Number(readEnv('PADDLE_OCR_REGION_TIMEOUT_MS') ?? 90000),
    });
    if (paddle.ok && paddle.text.trim()) {
      out.push({
        regionId: region.id,
        variant,
        engine: 'paddle',
        text: paddle.text.trim(),
        lines: (paddle.lines ?? []).map((l) => ({ ...l, engine: 'paddle' as const })),
      });
    }
    if (tessEnabled && out.length < variants.length * 2) {
      try {
        const tess = await recognizeTesseractCrop(crop, subjectName);
        if (tess.text.trim()) {
          out.push({
            regionId: region.id,
            variant,
            engine: 'tesseract',
            text: tess.text.trim(),
            lines: tess.lines,
          });
        }
      } catch {
        // bounded retry — skip tess on this variant
      }
    }
  }
  return out;
}

function solutionRecoveryLooksPlausible(recovery: string): boolean {
  const r = recovery.trim();
  if (!r) return false;
  if (!/\d\s*\/\s*\d/.test(r) && !/÷/.test(r)) return false;
  if (/\bSotution\b/i.test(r)) return false;
  if ((r.match(/\d{6,}/g) ?? []).length > 0) return false;
  return true;
}

function replaceLineWindow(
  lines: string[],
  startIdx: number,
  endIdx: number,
  recoveryLines: string[],
): string[] {
  const next = [...lines];
  next.splice(startIdx, Math.max(0, endIdx - startIdx), ...recoveryLines);
  return next;
}

export type SpliceRegionOptions = {
  /** Pix2Text path: accept exercise grid when structural checks pass, not frac score alone */
  pix2textMode?: boolean;
  pix2textExerciseGridOk?: boolean;
};

export function spliceRegionIntoTranscript(
  baseText: string,
  region: MathRegion,
  recoveryText: string,
  options?: SpliceRegionOptions,
): { text: string; applied: boolean } {
  const recovery = cleanMergedPageOcrText(recoveryText);
  if (!recovery.trim()) return { text: baseText, applied: false };

  const baseRegionScore = scoreFractionOcrText(region.sourceLineTexts.join(' '));
  const recoveryScore = scoreFractionOcrText(recovery);
  const skipScoreGate =
    options?.pix2textMode &&
    region.kind === 'exercise_grid_band' &&
    options.pix2textExerciseGridOk;
  if (!skipScoreGate && recoveryScore <= baseRegionScore && region.kind !== 'exercise_grid_band') {
    return { text: baseText, applied: false };
  }

  const lines = baseText.split(/\r?\n/);
  const recoveryLines = recovery.split(/\r?\n/).filter((l) => l.trim());

  if (region.kind === 'solution_block') {
    if (!solutionRecoveryLooksPlausible(recovery)) {
      return { text: baseText, applied: false };
    }
    const solIdx = lines.findIndex((l) => /^Solution\b/i.test(l.trim()));
    if (solIdx >= 0) {
      let end = solIdx + 1;
      while (end < lines.length && end < solIdx + 14) {
        const t = lines[end].trim();
        if (/^Hence\b/i.test(t) || /^Therefore\b/i.test(t)) break;
        end += 1;
      }
      if (recoveryScore > baseRegionScore || recoveryImprovesLine(lines.slice(solIdx + 1, end).join(' '), recovery)) {
        return {
          text: replaceLineWindow(lines, solIdx + 1, end, recoveryLines).join('\n'),
          applied: true,
        };
      }
    }
  }

  if (region.kind === 'exercise_grid_band' && region.anchorText) {
    const anchor = region.anchorText.slice(0, 32);
    const idx = lines.findIndex((l) => l.includes(anchor) || /\bdivide\b.*\bfractions?\b/i.test(l));
    const scoreOk = recoveryScore > baseRegionScore || skipScoreGate;
    if (idx >= 0 && scoreOk) {
      let end = idx + 1;
      while (end < lines.length && end < idx + 16 && !/Real-life|Story Sums/i.test(lines[end])) {
        end += 1;
      }
      return {
        text: replaceLineWindow(lines, idx + 1, end, recoveryLines).join('\n'),
        applied: true,
      };
    }
  }

  const sourceSet = new Set(region.sourceLineTexts.map((s) => s.trim()).filter(Boolean));
  let applied = false;
  const next = lines.map((line) => {
    const t = line.trim();
    if (!sourceSet.has(t)) return line;
    if (!recoveryImprovesLine(t, recovery)) return line;
    applied = true;
    return recovery;
  });

  if (!applied) return { text: baseText, applied: false };
  return { text: next.join('\n'), applied: true };
}

/**
 * Bounded region-level OCR retries + conservative splice into page transcript.
 */
export async function applyMathRegionRecovery(input: {
  imageBuffer: Buffer;
  imageWidth: number;
  imageHeight: number;
  baseTranscript: string;
  paddleLines?: OcrStructuredLine[];
  tesseractLines?: OcrStructuredLine[];
  subjectName?: string | null;
}): Promise<MathRegionRecoveryResult> {
  const base = (input.baseTranscript ?? '').trim();
  if (!base || !input.imageBuffer?.length) {
    return {
      text: base,
      appliedRegions: [],
      uncertainRegions: [],
      candidates: [],
      skippedReason: 'empty_input',
    };
  }
  if (!mathRegionRecoveryEnabled() || !subjectEligibleForMathRegionRecovery(input.subjectName)) {
    return {
      text: base,
      appliedRegions: [],
      uncertainRegions: [],
      candidates: [],
      skippedReason: 'disabled_or_subject',
    };
  }

  const regions = detectUncertainMathRegions({
    paddleLines: input.paddleLines,
    tesseractLines: input.tesseractLines,
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
  }).slice(0, maxMathRegionsPerPage());

  if (!regions.length) {
    return {
      text: base,
      appliedRegions: [],
      uncertainRegions: [],
      candidates: [],
      skippedReason: 'no_regions',
    };
  }

  const allCandidates: RegionOcrCandidate[] = [];
  let text = base;
  const appliedRegions: string[] = [];
  const uncertainRegions: string[] = [];

  for (const region of regions) {
    const candidates = await ocrRegionVariants(
      input.imageBuffer,
      region,
      input.subjectName,
    );
    allCandidates.push(...candidates);
    const best = pickBestCandidate(candidates.filter((c) => c.regionId === region.id));
    const baseRegionScore = scoreFractionOcrText(region.sourceLineTexts.join(' '));
    if (!best || scoreFractionOcrText(best.text) <= baseRegionScore) {
      uncertainRegions.push(region.id);
      continue;
    }
    const before = text;
    const { text: merged, applied } = spliceRegionIntoTranscript(text, region, best.text);
    if (applied) {
      const cleaned = cleanMergedPageOcrText(merged);
      const dupStory =
        (cleaned.match(/Real-life Story Sums/gi) ?? []).length -
        (before.match(/Real-life Story Sums/gi) ?? []).length;
      if (dupStory > 0 && region.kind === 'exercise_grid_band') {
        uncertainRegions.push(region.id);
        continue;
      }
      const henceDup =
        (cleaned.match(/\bHence\b/gi) ?? []).length - (before.match(/\bHence\b/gi) ?? []).length;
      if (
        !containsForeignScriptNoise(cleaned) &&
        scoreFractionOcrText(cleaned) >= scoreFractionOcrText(before) &&
        henceDup <= 0
      ) {
        text = cleaned;
        appliedRegions.push(region.id);
      } else {
        uncertainRegions.push(region.id);
      }
    } else {
      uncertainRegions.push(region.id);
    }
  }

  if (scoreFractionOcrText(text) < scoreFractionOcrText(base)) {
    return {
      text: base,
      appliedRegions: [],
      uncertainRegions: regions.map((r) => r.id),
      candidates: allCandidates,
      skippedReason: 'worse_than_base',
    };
  }

  return {
    text,
    appliedRegions,
    uncertainRegions,
    candidates: allCandidates,
  };
}
