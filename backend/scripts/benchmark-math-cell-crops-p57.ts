/**
 * Phase 6.2 isolated crop recognition benchmark (D1/D2/D3).
 * No page-level merge; Pix2Text off.
 *
 * Usage (backend/):
 *   OCR_PIX2TEXT_MATH_CROPS=0 npx tsx scripts/benchmark-math-cell-crops-p57.ts
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { prepareOrientedVariant } from '../src/lessons/page-image-prep';
import { detectDivideExerciseGridLayout } from '../src/lessons/ocr-math-cell-layout';
import { validateCellCropGeometry, padCellBox } from '../src/lessons/ocr-math-cell-geometry';
import { assessCellMappingGate } from '../src/lessons/ocr-math-cell-geometry-gate';
import { cropPageRegion, type RegionPreprocessVariant } from '../src/lessons/ocr-region-image-prep';
import { imageDimensionsFromBuffer } from '../src/lessons/ocr-image-dimensions';
import { runPaddleOcrOnBuffer } from '../src/lessons/paddle-ocr.runner';
import { strictCellExpressionMatches } from '../src/lessons/ocr-diagnostic/evaluate-ground-truth';
import { exerciseCellGridPosition } from '../src/lessons/ocr-exercise-grid-cells';
import { releaseMathCellTesseractWorker } from '../src/lessons/ocr-math-cell-ocr';

const EXPECTED_ORIENT_SHA = '59172c0be72d8f78d8593bceb068cce4b9064a4f18750343a41a085020133dd1';
const IMAGE = join(process.cwd(), 'test-fixtures/fractions-chapter-calibration/p57-divide-grid.jpg');
const GT = join(process.cwd(), '../docs/ocr/ground_truth/p57-divide-grid.json');
const OUT = join(process.cwd(), 'var/math-cell-eval/p57');
const TARGETS = ['a', 'b', 'e', 'n'] as const;

async function tesseractBatch(crops: Buffer[]): Promise<Array<{ text: string; ms: number }>> {
  const tesseract = await import('tesseract.js');
  const worker = await tesseract.createWorker('eng', 1, { logger: () => undefined });
  const out: Array<{ text: string; ms: number }> = [];
  try {
    for (const buf of crops) {
      const t0 = Date.now();
      const { data } = await worker.recognize(buf);
      out.push({ text: (data.text ?? '').trim(), ms: Date.now() - t0 });
    }
  } finally {
    await worker.terminate();
  }
  return out;
}

function labelVisibleInRaw(label: string, raw: string): boolean {
  return new RegExp(`\\b${label}\\s*\\.`, 'i').test(raw);
}

async function main() {
  process.env.OCR_PIX2TEXT_MATH_CROPS = '0';
  if (!existsSync(IMAGE)) {
    console.error('missing image', IMAGE);
    process.exit(2);
  }
  mkdirSync(OUT, { recursive: true });

  const gt = JSON.parse(readFileSync(GT, 'utf-8'));
  const gtByLabel = new Map<string, string>(
    (gt.cells as Array<{ label: string; text: string }>).map((c) => [c.label, c.text]),
  );

  const raw = readFileSync(IMAGE);
  const file = {
    buffer: raw,
    mimetype: 'image/jpeg',
    originalname: 'p57-divide-grid.jpg',
    size: raw.length,
  } as Express.Multer.File;

  const variant = await prepareOrientedVariant(file, 0);
  const orientBuf = variant.ocr.buffer;
  const orientSha = createHash('sha256').update(orientBuf).digest('hex');
  if (orientSha !== EXPECTED_ORIENT_SHA) {
    console.error('orient sha mismatch', { got: orientSha, expected: EXPECTED_ORIENT_SHA });
    process.exit(3);
  }

  const dims = await imageDimensionsFromBuffer(orientBuf);
  const layout = await detectDivideExerciseGridLayout({
    imageBuffer: orientBuf,
    pageWidth: dims.width,
    pageHeight: dims.height,
    transcript: '7. Divide the following fractions',
    paddleLines: [],
    tesseractLines: [],
    testCaseId: 'p57-divide-grid',
  });
  if (!layout) {
    console.error('layout failed');
    process.exit(4);
  }
  if (!layout) {
    console.error('layout detection failed');
    process.exit(4);
  }

  const mappingGate: Record<string, unknown> = {};
  let gatePassed = true;
  for (const label of TARGETS) {
    const cell = layout.cells.find((c) => c.label === label);
    if (!cell) {
      gatePassed = false;
      continue;
    }
    const geom = await validateCellCropGeometry({
      imageBuffer: orientBuf,
      pageWidth: dims.width,
      pageHeight: dims.height,
      label,
      box: cell.box,
    });
    const gate = assessCellMappingGate({
      label,
      box: cell.box,
      gridBox: layout.gridBox,
      geometry: geom,
      storyBandY0: layout.gridBox.y1 + 12,
    });
    mappingGate[label] = gate;
    if (!gate.correctMapping || gate.status === 'FAIL') gatePassed = false;
  }
  if (!gatePassed) {
    const outPath = join(OUT, 'report-D-skipped.json');
    writeFileSync(
      outPath,
      JSON.stringify({ experiment: 'D', skipped: true, mappingGate, orientSha256: orientSha }, null, 2),
    );
    console.error('geometry gate failed — OCR benchmark skipped', mappingGate);
    process.exit(5);
  }

  const crops: Record<string, { buffer: Buffer; hash: string; box: unknown; geom: unknown }> = {};
  for (const label of TARGETS) {
    const cell = layout.cells.find((c) => c.label === label);
    if (!cell) continue;
    const geom = await validateCellCropGeometry({
      imageBuffer: orientBuf,
      pageWidth: dims.width,
      pageHeight: dims.height,
      label,
      box: cell.box,
    });
    const padded = padCellBox(cell.box, 6, dims.width, dims.height);
    const buffer = await cropPageRegion(orientBuf, padded, 'original');
    const hash = createHash('sha256').update(buffer).digest('hex');
    const path = join(OUT, `d-crop-${label}-original.jpg`);
    writeFileSync(path, buffer);
    crops[label] = { buffer, hash, box: { cell: cell.box, padded, geom }, geom };
  }

  const mapping: Record<string, unknown> = {};
  for (const label of TARGETS) {
    mapping[label] = {
      gridPosition: exerciseCellGridPosition(label),
      expectedExpression: gtByLabel.get(label),
    };
  }

  const d1: Record<string, unknown> = {};
  const paddleWall0 = Date.now();
  let paddleColdMs = 0;
  for (let i = 0; i < TARGETS.length; i++) {
    const label = TARGETS[i];
    const crop = crops[label];
    if (!crop) continue;
    const t0 = Date.now();
    const result = await runPaddleOcrOnBuffer(
      { buffer: crop.buffer, mimetype: 'image/jpeg', originalname: `${label}.jpg` },
      { subjectName: 'Mathematics' },
    );
    const ms = Date.now() - t0;
    if (i === 0) paddleColdMs = ms;
    const meta = await import('sharp').then((m) => {
      const sharp = m.default ?? m;
      return sharp(crop.buffer).metadata();
    });
    const confidences =
      result.lines?.map((l) => l.confidence).filter((c): c is number => typeof c === 'number') ?? [];
    d1[label] = {
      cropSha256: crop.hash,
      width: meta.width,
      height: meta.height,
      ok: result.ok,
      error: result.error,
      rawText: result.text,
      lineCount: result.lines?.length ?? 0,
      confidenceMin: confidences.length ? Math.min(...confidences) : null,
      confidenceMax: confidences.length ? Math.max(...confidences) : null,
      inferenceMs: ms,
      strictMatch: strictCellExpressionMatches(result.text, gtByLabel.get(label) ?? ''),
      labelVisibleInRaw: labelVisibleInRaw(label, result.text),
    };
  }
  const paddleTotalMs = Date.now() - paddleWall0;

  const d2: Record<string, unknown> = {};
  const tessBuffers = TARGETS.map((l) => crops[l]?.buffer).filter(Boolean) as Buffer[];
  const tessWall0 = Date.now();
  const tessResults = await tesseractBatch(tessBuffers);
  const tessTotalMs = Date.now() - tessWall0;
  TARGETS.forEach((label, i) => {
    const crop = crops[label];
    const tr = tessResults[i];
    if (!crop || !tr) return;
    d2[label] = {
      cropSha256: crop.hash,
      rawText: tr.text,
      inferenceMs: tr.ms,
      strictMatch: strictCellExpressionMatches(tr.text, gtByLabel.get(label) ?? ''),
      labelVisibleInRaw: labelVisibleInRaw(label, tr.text),
      tessConfig: 'eng default worker (tesseract.js createWorker)',
    };
  });

  const d3 = TARGETS.map((label) => ({
    cell: label,
    groundTruth: gtByLabel.get(label),
    paddleRaw: (d1[label] as { rawText?: string })?.rawText ?? '',
    tesseractRaw: (d2[label] as { rawText?: string })?.rawText ?? '',
    paddleExact: (d1[label] as { strictMatch?: boolean })?.strictMatch ?? false,
    tesseractExact: (d2[label] as { strictMatch?: boolean })?.strictMatch ?? false,
    paddleShowsExpectedLabel: (d1[label] as { labelVisibleInRaw?: boolean })?.labelVisibleInRaw ?? false,
    tesseractShowsExpectedLabel: (d2[label] as { labelVisibleInRaw?: boolean })?.labelVisibleInRaw ?? false,
  }));

  let variantProbe: Record<string, unknown> | undefined;
  if (process.env.MATH_CELL_BENCHMARK_VARIANTS === '1') {
    const variants: RegionPreprocessVariant[] = ['original', 'upscale', 'contrast'];
    variantProbe = {};
    for (const label of TARGETS) {
      const cell = layout.cells.find((c) => c.label === label);
      if (!cell) continue;
      const padded = padCellBox(cell.box, 6, dims.width, dims.height);
      const perLabel: Record<string, unknown> = {};
      for (const v of variants) {
        const buf = await cropPageRegion(orientBuf, padded, v);
        const hash = createHash('sha256').update(buf).digest('hex');
        writeFileSync(join(OUT, `d-crop-${label}-${v}.jpg`), buf);
        const t0 = Date.now();
        const result = await runPaddleOcrOnBuffer(
          { buffer: buf, mimetype: 'image/jpeg', originalname: `${label}-${v}.jpg` },
          { subjectName: 'Mathematics' },
        );
        perLabel[v] = {
          sha256: hash,
          inferenceMs: Date.now() - t0,
          rawText: result.text,
          strictMatch: strictCellExpressionMatches(result.text, gtByLabel.get(label) ?? ''),
        };
      }
      variantProbe[label] = perLabel;
    }
  }

  await releaseMathCellTesseractWorker();

  const report = {
    experiment: 'D',
    orientSha256: orientSha,
    dimensions: dims,
    layout: {
      gridBox: layout.gridBox,
      gridLines: layout.gridLines,
    },
    cellToGroundTruthMapping: mapping,
    D1_paddleOnly: d1,
    D2_tesseractOnly: d2,
    D3_comparison: d3,
    D1_timing: {
      paddleColdFirstCropMs: paddleColdMs,
      paddleSequentialTotalMs: paddleTotalMs,
      note: 'Each crop spawns a separate Python Paddle worker (no cross-crop model reuse in current runner).',
    },
    D2_timing: {
      tesseractBatchTotalMs: tessTotalMs,
      note: 'Single Tesseract worker reused across four crops.',
    },
    E_variantProbe_paddle: variantProbe ?? null,
    pythonBinary: process.env.PADDLE_OCR_PYTHON || process.env.PYTHON || 'python',
  };

  const outPath = join(OUT, 'report-D.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outPath, D3: d3, paddleTotalMs, tessTotalMs }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
