/**
 * Phase 6.8 — dedicated math recognition benchmark on verified crops.
 *
 * Usage (from backend/):
 *   npx tsx scripts/run-math-recog-benchmark-6.8.ts
 *
 * Optional: PADDLE_OCR_PYTHON=...\.venv-paddle\Scripts\python.exe
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import sharp from 'sharp';
import { runPaddleOcrOnBuffer, paddleOcrEnabled } from '../src/lessons/paddle-ocr.runner';
import { releaseMathCellTesseractWorker } from '../src/lessons/ocr-math-cell-ocr';
import { runMathCellPix2TextBatch } from '../src/lessons/ocr-math-cell-pix2text';
import { resolvePix2TextPythonBinary } from '../src/lessons/pix2text-math.runner';
import { fuseCellOcrCandidates } from '../src/lessons/ocr-math-cell-fusion';
import { pix2textPlainForFusion } from '../src/lessons/ocr-pix2text-latex-plain';
import {
  classifyMathStructures,
  scoreBenchmarkRow,
  summarizeStrictScores,
  type BenchmarkSample,
} from '../src/lessons/ocr-diagnostic/math-recog-benchmark';

const OUT = join(process.cwd(), 'var/math-cell-eval/phase-6.8');
const EVAL_DIR = join(process.cwd(), 'eval/math-recog-benchmark-6.8');
const P57_CROPS = join(process.cwd(), 'var/math-cell-eval/p57-6.7');
const P57_GT = join(process.cwd(), '../docs/ocr/ground_truth/p57-divide-grid.json');
const P43_GT = join(process.cwd(), '../docs/ocr/ground_truth/p43-mult-whole.json');
const P43_IMAGE = join(process.cwd(), 'test-fixtures/fractions-chapter-calibration/p43-mult-whole.jpg');
const P57_IMAGE_SHA = '7f7d9a8665ce97fc87a0e3af15a3a6c61463c17954e521b9ef04acb2f9506be0';

type P57Cell = 'a' | 'b' | 'e' | 'n';

const P57_GEOMETRY: Record<P57Cell, 'verified_complete' | 'geometry_unresolved'> = {
  a: 'verified_complete',
  b: 'verified_complete',
  e: 'geometry_unresolved',
  n: 'verified_complete',
};

function sha(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

async function upscale2x(buf: Buffer): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  return sharp(buf)
    .resize({ width: w * 2, height: h * 2, kernel: 'lanczos3' })
    .jpeg({ quality: 92 })
    .toBuffer();
}

async function buildManifest(): Promise<{ samples: BenchmarkSample[]; cropPaths: Map<string, string> }> {
  mkdirSync(join(OUT, 'crops'), { recursive: true });
  const gt = JSON.parse(readFileSync(P57_GT, 'utf-8'));
  const samples: BenchmarkSample[] = [];
  const cropPaths = new Map<string, string>();

  for (const label of ['a', 'b', 'e', 'n'] as P57Cell[]) {
    const expected = gt.cells.find((c: { label: string }) => c.label === label)?.text ?? '';
    const suffix = label === 'n' ? 'C-ink-guided' : 'B-phase66';
    const src = join(P57_CROPS, `crop-${label}-${suffix}.jpg`);
    if (!existsSync(src)) throw new Error(`missing crop ${src}`);
    const orig = readFileSync(src);
    const up = await upscale2x(orig);
    for (const scale of ['original', 'upscale2x'] as const) {
      const buf = scale === 'original' ? orig : up;
      const id = `p57-${label}-${scale}`;
      const outPath = join(OUT, 'crops', `${id}.jpg`);
      writeFileSync(outPath, buf);
      cropPaths.set(id, outPath);
      samples.push({
        sampleId: id,
        fixtureId: 'p57-divide-grid',
        expressionId: label,
        sourceImageSha256: P57_IMAGE_SHA,
        cropSha256: sha(buf),
        cropMethod: label === 'n' ? 'ink_guided_6.7' : 'phase_6.6_fixture',
        scale,
        groundTruth: expected,
        geometryCategory: P57_GEOMETRY[label],
        structures: classifyMathStructures(expected),
      });
    }
  }

  if (existsSync(P43_IMAGE)) {
    const p43 = JSON.parse(readFileSync(P43_GT, 'utf-8'));
    const region = p43.regionNorm as [number, number, number, number];
    const raw = readFileSync(P43_IMAGE);
    const meta = await sharp(raw).metadata();
    const w = meta.width ?? 1;
    const h = meta.height ?? 1;
    const box = {
      x0: Math.round(region[0] * w),
      y0: Math.round(region[1] * h),
      x1: Math.round(region[2] * w),
      y1: Math.round(region[3] * h),
    };
    const { cropPageRegion } = await import('../src/lessons/ocr-region-image-prep');
    const orig = await cropPageRegion(raw, box, 'original');
    const up = await upscale2x(orig);
    const expected = p43.cells[0].text as string;
    for (const scale of ['original', 'upscale2x'] as const) {
      const buf = scale === 'original' ? orig : up;
      const id = `p43-snippet-${scale}`;
      const outPath = join(OUT, 'crops', `${id}.jpg`);
      writeFileSync(outPath, buf);
      cropPaths.set(id, outPath);
      samples.push({
        sampleId: id,
        fixtureId: 'p43-mult-whole',
        expressionId: 'snippet',
        sourceImageSha256: p43.imageSha256,
        cropSha256: sha(buf),
        cropMethod: 'ground_truth_regionNorm',
        scale,
        groundTruth: expected,
        geometryCategory: 'verified_complete',
        structures: classifyMathStructures(expected),
      });
    }
  }

  return { samples, cropPaths };
}

async function runTesseractOnCrops(samples: BenchmarkSample[], cropPaths: Map<string, string>) {
  const tesseract = await import('tesseract.js');
  const worker = await tesseract.createWorker('eng', 1, { logger: () => undefined });
  const t0 = Date.now();
  const rows: Array<{ sampleId: string; rawOutput: string; error: string | null; inferenceMs: number }> = [];
  for (const s of samples) {
    const t1 = Date.now();
    let err: string | null = null;
    let text = '';
    try {
      const buf = readFileSync(cropPaths.get(s.sampleId)!);
      const { data } = await worker.recognize(buf);
      text = (data.text ?? '').trim();
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    rows.push({ sampleId: s.sampleId, rawOutput: text, error: err, inferenceMs: Date.now() - t1 });
  }
  await worker.terminate();
  return { modelId: 'tesseract', initMs: Date.now() - t0, rows };
}

async function runPaddleOnCrops(samples: BenchmarkSample[], cropPaths: Map<string, string>) {
  if (!paddleOcrEnabled()) {
    return { modelId: 'paddle', skipped: 'paddle disabled', rows: [] };
  }
  const t0 = Date.now();
  let initMs = 0;
  const rows: Array<{ sampleId: string; rawOutput: string; error: string | null; inferenceMs: number }> = [];
  for (const s of samples) {
    const t1 = Date.now();
    const buf = readFileSync(cropPaths.get(s.sampleId)!);
    const paddle = await runPaddleOcrOnBuffer(
      { buffer: buf, mimetype: 'image/jpeg', originalname: `${s.sampleId}.jpg` },
      { subjectName: 'Mathematics' },
    );
    if (rows.length === 0) initMs = Date.now() - t0;
    rows.push({
      sampleId: s.sampleId,
      rawOutput: paddle.text?.trim() ?? '',
      error: paddle.ok ? null : paddle.error ?? 'paddle_failed',
      inferenceMs: Date.now() - t1,
    });
  }
  return { modelId: 'paddle', initMs, rows };
}

function runPythonModel(model: 'pix2text' | 'pix2tex', samples: BenchmarkSample[], cropPaths: Map<string, string>) {
  const inputPath = join(OUT, `benchmark-input-${model}.json`);
  const outputPath = join(OUT, `results-${model}.json`);
  const py = resolvePix2TextPythonBinary();
  writeFileSync(
    inputPath,
    JSON.stringify({
      samples: samples.map((s) => ({ sampleId: s.sampleId, imagePath: cropPaths.get(s.sampleId) })),
    }),
  );
  const worker = join(EVAL_DIR, 'benchmark_worker.py');
  const t0 = Date.now();
  const proc = spawnSync(py, [worker, '--model', model, '--input', inputPath, '--output', outputPath], {
    encoding: 'utf-8',
    timeout: 600_000,
  });
  const wallMs = Date.now() - t0;
  if (proc.status !== 0) {
    return { modelId: model, error: proc.stderr || proc.stdout, wallMs, rows: [] };
  }
  const parsed = JSON.parse(readFileSync(outputPath, 'utf-8'));
  return { ...parsed, wallMs };
}

async function runPix2TextNode(samples: BenchmarkSample[], cropPaths: Map<string, string>, scale: 'original' | 'upscale2x') {
  const subset = samples.filter((s) => s.scale === scale);
  process.env.OCR_PIX2TEXT_MATH_CROPS = '1';
  process.env.OCR_MATH_CELL_PIX2TEXT_UPSCALE = '0';
  const t0 = Date.now();
  const batch = await runMathCellPix2TextBatch({
    crops: subset.map((s) => ({
      label: 'a',
      buffer: readFileSync(cropPaths.get(s.sampleId)!),
    })),
  });
  process.env.OCR_PIX2TEXT_MATH_CROPS = '0';
  const loadMs = batch.batches[0]?.batch.loadMs ?? 0;
  const rows = subset.map((s, i) => {
    const row = batch.batches[0]?.rows[i];
    return {
      sampleId: s.sampleId,
      rawOutput: row?.rawLatex ?? '',
      error: row?.ok ? null : row?.error ?? 'pix2text_failed',
      inferenceMs: row?.inferenceMs ?? 0,
    };
  });
  return { modelId: `pix2text_node_${scale}`, initMs: loadMs, wallMs: Date.now() - t0, rows };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { samples, cropPaths } = await buildManifest();
  writeFileSync(join(OUT, 'benchmark-manifest.json'), JSON.stringify({ version: '6.8', samples }, null, 2));

  const modelRuns: Record<string, unknown> = {};
  const timing: Record<string, unknown> = {};

  modelRuns.paddle = await runPaddleOnCrops(samples, cropPaths);
  timing.paddle = { initMs: (modelRuns.paddle as { initMs?: number }).initMs };

  modelRuns.tesseract = await runTesseractOnCrops(samples, cropPaths);
  timing.tesseract = { initMs: (modelRuns.tesseract as { initMs?: number }).initMs };

  modelRuns.pix2text = runPythonModel('pix2text', samples, cropPaths);
  timing.pix2text = { wallMs: (modelRuns.pix2text as { wallMs?: number }).wallMs, initMs: (modelRuns.pix2text as { initMs?: number }).initMs };

  modelRuns.pix2tex = runPythonModel('pix2tex', samples, cropPaths);
  timing.pix2tex = { wallMs: (modelRuns.pix2tex as { wallMs?: number }).wallMs, initMs: (modelRuns.pix2tex as { initMs?: number }).initMs };

  modelRuns.pix2text_node_original = await runPix2TextNode(samples, cropPaths, 'original');
  modelRuns.pix2text_node_upscale2x = await runPix2TextNode(samples, cropPaths, 'upscale2x');

  await releaseMathCellTesseractWorker();

  const scoreRows: ReturnType<typeof scoreBenchmarkRow>[] = [];
  const sampleById = new Map(samples.map((s) => [s.sampleId, s]));

  const modelIds = ['paddle', 'tesseract', 'pix2text', 'pix2tex', 'pix2text_node_original', 'pix2text_node_upscale2x'];
  for (const mid of modelIds) {
    const run = modelRuns[mid] as { rows?: Array<{ sampleId: string; rawOutput: string; error: string | null }> };
    for (const r of run.rows ?? []) {
      const sample = sampleById.get(r.sampleId);
      if (!sample) continue;
      scoreRows.push(scoreBenchmarkRow(sample, mid, r.rawOutput, r.error));
    }
  }

  for (const s of samples.filter((x) => x.fixtureId === 'p57-divide-grid' && x.scale === 'original')) {
    const paddleR = (modelRuns.paddle as { rows: Array<{ sampleId: string; rawOutput: string }> }).rows.find(
      (r) => r.sampleId === s.sampleId,
    );
    const tessR = (modelRuns.tesseract as { rows: Array<{ sampleId: string; rawOutput: string }> }).rows.find(
      (r) => r.sampleId === s.sampleId,
    );
    const pixR = (modelRuns.pix2text as { rows: Array<{ sampleId: string; rawOutput: string }> }).rows.find(
      (r) => r.sampleId === s.sampleId,
    );
    if (!paddleR || !tessR || !pixR) continue;
    const fused = fuseCellOcrCandidates(s.expressionId as P57Cell, [
      { engine: 'paddle', variant: 'original', rawText: paddleR.rawOutput, ms: 0 },
      { engine: 'tesseract', variant: 'original', rawText: tessR.rawOutput, ms: 0 },
      { engine: 'pix2text', variant: 'original', rawText: pix2textPlainForFusion(pixR.rawOutput), ms: 0 },
    ]);
    scoreRows.push(scoreBenchmarkRow(s, 'fusion_exploratory', fused?.text ?? '', fused ? null : 'fusion_empty'));
  }

  const verifiedOnly = scoreRows.filter((r) => r.geometryCategory === 'verified_complete');
  const summary = {
    all: summarizeStrictScores(scoreRows),
    verifiedCompleteOnly: summarizeStrictScores(verifiedOnly),
    byModel: Object.fromEntries(
      modelIds.map((mid) => [mid, summarizeStrictScores(scoreRows.filter((r) => r.modelId === mid))]),
    ),
    fusion_exploratory: summarizeStrictScores(scoreRows.filter((r) => r.modelId === 'fusion_exploratory')),
  };

  const comparison = {
    phase: '6.8',
    generatedAt: new Date().toISOString(),
    gitHead: 'b982a21',
    sampleCount: samples.length,
    expressionCount: samples.length,
    pythonEvalVenv: resolvePix2TextPythonBinary(),
    paddlePython: process.env.PADDLE_OCR_PYTHON ?? 'default',
    timing,
    modelRuns: Object.fromEntries(
      Object.entries(modelRuns).map(([k, v]) => [
        k,
        {
          initMs: (v as { initMs?: number }).initMs,
          wallMs: (v as { wallMs?: number }).wallMs,
          packageVersion: (v as { packageVersion?: string }).packageVersion,
          error: (v as { error?: string }).error,
          rowCount: ((v as { rows?: unknown[] }).rows ?? []).length,
        },
      ]),
    ),
    summary,
    scores: scoreRows,
  };

  writeFileSync(join(OUT, 'candidate-comparison.json'), JSON.stringify(comparison, null, 2));
  writeFileSync(join(OUT, 'raw-model-outputs.json'), JSON.stringify(modelRuns, null, 2));

  console.log(JSON.stringify({ out: OUT, summary: comparison.summary }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
