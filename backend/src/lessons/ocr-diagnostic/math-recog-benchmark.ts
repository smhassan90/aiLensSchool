import {
  scoreCellPrediction,
  strictCellExpressionMatches,
  type CellPredictionScore,
} from './evaluate-ground-truth';
import { normalizePix2TextPlain, pix2textPlainForFusion } from '../ocr-pix2text-latex-plain';

export type GeometryEvalCategory = 'verified_complete' | 'geometry_unresolved';

export type MathStructureFlags = {
  fraction: boolean;
  mixedNumber: boolean;
  division: boolean;
  multiplication: boolean;
};

export type BenchmarkSample = {
  sampleId: string;
  fixtureId: string;
  expressionId: string;
  sourceImageSha256: string;
  cropSha256: string;
  cropMethod: string;
  scale: 'original' | 'upscale2x';
  groundTruth: string;
  geometryCategory: GeometryEvalCategory;
  structures: MathStructureFlags;
};

export function classifyMathStructures(expression: string): MathStructureFlags {
  const t = expression ?? '';
  return {
    fraction: /\d\s*\/\s*\d/.test(t),
    mixedNumber: /\d+\s+\d+\s*\/\s*\d+/.test(t),
    division: /÷/.test(t),
    multiplication: /×/.test(t),
  };
}

function normalizeForComponents(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/×/g, 'x')
    .replace(/÷/g, '/');
}

/** Deterministic component checks — does not infer missing symbols. */
export function componentMetrics(expected: string, candidate: string): {
  divisionOperatorOk: boolean;
  multiplicationOperatorOk: boolean;
  expectedFractionParts: string[];
  matchedFractionParts: number;
  missingFractionParts: string[];
  extraNoise: boolean;
} {
  const e = normalizeForComponents(expected);
  const c = normalizeForComponents(
    candidate.replace(/^\s*[a-n]\s*\.\s*/i, '').replace(/^ceo\s*/i, ''),
  );
  const fracParts = [...e.matchAll(/(\d+)\/(\d+)/g)].map((m) => `${m[1]}/${m[2]}`);
  const matched = fracParts.filter((p) => c.includes(p.replace(/\s/g, '')));
  const missing = fracParts.filter((p) => !c.includes(p.replace(/\s/g, '')));
  return {
    divisionOperatorOk: e.includes('/') && e.includes('÷') ? c.includes('/') : true,
    multiplicationOperatorOk: e.includes('x') ? c.includes('x') : true,
    expectedFractionParts: fracParts,
    matchedFractionParts: matched.length,
    missingFractionParts: missing,
    extraNoise: c.length > e.length * 1.8 && !strictCellExpressionMatches(candidate, expected),
  };
}

export type BenchmarkModelResult = {
  modelId: string;
  sampleId: string;
  rawOutput: string;
  normalizedPlain: string;
  error: string | null;
  inferenceMs: number;
  initMs?: number;
  device?: string;
};

export type BenchmarkScoreRow = CellPredictionScore & {
  sampleId: string;
  modelId: string;
  scale: 'original' | 'upscale2x';
  geometryCategory: GeometryEvalCategory;
  rawLatexExact: boolean;
  components: ReturnType<typeof componentMetrics>;
  inferenceError: boolean;
  hallucinatedLabel: boolean;
};

export function scoreBenchmarkRow(
  sample: BenchmarkSample,
  modelId: string,
  rawOutput: string,
  error: string | null,
): BenchmarkScoreRow {
  const plain = pix2textPlainForFusion(rawOutput);
  const normalized = normalizePix2TextPlain(plain);
  const base = scoreCellPrediction(sample.expressionId, sample.groundTruth, plain);
  const rawNorm = normalizeForComponents(plain);
  const expNorm = normalizeForComponents(sample.groundTruth);
  return {
    ...base,
    sampleId: sample.sampleId,
    modelId,
    scale: sample.scale,
    geometryCategory: sample.geometryCategory,
    rawLatexExact: rawNorm === expNorm && !!rawOutput.trim(),
    components: componentMetrics(sample.groundTruth, plain),
    inferenceError: !!error,
    hallucinatedLabel: /ceo\s+b/i.test(rawOutput),
  };
}

export function summarizeStrictScores(rows: BenchmarkScoreRow[]): {
  strictExpressionMatches: number;
  total: number;
  byCategory: Record<GeometryEvalCategory, { hits: number; total: number }>;
} {
  const byCategory: Record<GeometryEvalCategory, { hits: number; total: number }> = {
    verified_complete: { hits: 0, total: 0 },
    geometry_unresolved: { hits: 0, total: 0 },
  };
  let hits = 0;
  for (const r of rows) {
    byCategory[r.geometryCategory].total += 1;
    if (r.strictExpressionMatch) {
      hits += 1;
      byCategory[r.geometryCategory].hits += 1;
    }
  }
  return { strictExpressionMatches: hits, total: rows.length, byCategory };
}
