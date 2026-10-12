/**
 * Phase 6.5: Pix2Text math crops + mixed-number normalization evaluation.
 * Usage (from backend/):
 *   npx tsx scripts/experiment-math-cell-phase-6.5.ts
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { prepareOrientedVariant } from '../src/lessons/page-image-prep';
import { detectDivideExerciseGridLayout } from '../src/lessons/ocr-math-cell-layout';
import { validateCellCropGeometry } from '../src/lessons/ocr-math-cell-geometry';
import { cropPageRegion } from '../src/lessons/ocr-region-image-prep';
import { imageDimensionsFromBuffer } from '../src/lessons/ocr-image-dimensions';
import { runMathCellPix2TextBatch } from '../src/lessons/ocr-math-cell-pix2text';
import { resolvePix2TextPythonBinary } from '../src/lessons/pix2text-math.runner';
import { pix2textPlainForFusion, normalizePix2TextPlain } from '../src/lessons/ocr-pix2text-latex-plain';
import { scoreCellPrediction, strictCellExpressionMatches } from '../src/lessons/ocr-diagnostic/evaluate-ground-truth';
import { fuseCellOcrCandidates } from '../src/lessons/ocr-math-cell-fusion';
import { mathCellPix2TextCandidatesForFusion } from '../src/lessons/ocr-math-cell-pix2text';

const OUT = join(process.cwd(), 'var/math-cell-eval/p57-6.5');
const EXPECTED_ORIENT_SHA = '59172c0be72d8f78d8593bceb068cce4b9064a4f18750343a41a085020133dd1';
const P57_IMAGE = join(process.cwd(), 'test-fixtures/fractions-chapter-calibration/p57-divide-grid.jpg');
const P57_GT = join(process.cwd(), '../docs/ocr/ground_truth/p57-divide-grid.json');
const P43_IMAGE = join(process.cwd(), 'test-fixtures/fractions-chapter-calibration/p43-mult-whole.jpg');
const P43_GT = join(process.cwd(), '../docs/ocr/ground_truth/p43-mult-whole.json');
const TARGETS = ['a', 'b', 'e', 'n'] as const;

async function sha256(buf: Buffer): Promise<string> {
  return createHash('sha256').update(buf).digest('hex');
}

async function annotateCropBounds(
  orientBuf: Buffer,
  boxes: Array<{ label: string; box: { x0: number; y0: number; x1: number; y1: number }; color: string }>,
  outPath: string,
): Promise<void> {
  const meta = await sharp(orientBuf).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const svgParts = boxes.map(
    (b) =>
      `<rect x="${b.box.x0}" y="${b.box.y0}" width="${b.box.x1 - b.box.x0}" height="${b.box.y1 - b.box.y0}" fill="none" stroke="${b.color}" stroke-width="2"/><text x="${b.box.x0 + 4}" y="${b.box.y0 + 14}" font-size="14" fill="${b.color}">${b.label}</text>`,
  );
  const svg = `<svg width="${w}" height="${h}">${svgParts.join('')}</svg>`;
  await sharp(orientBuf)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toFile(outPath);
}

async function loadP57Crops() {
  const raw = readFileSync(P57_IMAGE);
  const file = {
    buffer: raw,
    mimetype: 'image/jpeg',
    originalname: 'p57-divide-grid.jpg',
    size: raw.length,
  } as Express.Multer.File;
  const variant = await prepareOrientedVariant(file, 0);
  const orientBuf = variant.ocr.buffer;
  const orientSha = await sha256(orientBuf);
  if (orientSha !== EXPECTED_ORIENT_SHA) {
    throw new Error(`orient sha mismatch ${orientSha}`);
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
  if (!layout) throw new Error('no layout');

  const crops: Record<string, { buffer: Buffer; hash: string; box: typeof layout.cells[0]['box'] }> = {};
  const boxesForViz: Array<{ label: string; box: { x0: number; y0: number; x1: number; y1: number }; color: string }> =
    [];

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
    const crop = await cropPageRegion(orientBuf, geom.paddedBox, 'original');
    crops[label] = { buffer: crop, hash: await sha256(crop), box: cell.box };
    boxesForViz.push({ label: `${label}-baseline`, box: geom.paddedBox, color: '#00aa00' });
    const wide = {
      x0: geom.paddedBox.x0,
      y0: geom.paddedBox.y0,
      x1: Math.min(dims.width - 1, geom.paddedBox.x1 + Math.round((geom.paddedBox.x1 - geom.paddedBox.x0) * 0.12)),
      y1: geom.paddedBox.y1,
    };
    if (label === 'e' || label === 'n') {
      boxesForViz.push({ label: `${label}-wide`, box: wide, color: '#cc0000' });
    }
    writeFileSync(join(OUT, `crop-${label}-baseline.jpg`), crop);
    const wideCrop = await cropPageRegion(orientBuf, wide, 'original');
    writeFileSync(join(OUT, `crop-${label}-wide-proposal.jpg`), wideCrop);
  }

  await annotateCropBounds(orientBuf, boxesForViz, join(OUT, 'crop-bounds-annotated.jpg'));

  return { orientBuf, orientSha, dims, layout, crops };
}

async function runP57Pix2Variants(crops: Record<string, { buffer: Buffer }>) {
  process.env.OCR_PIX2TEXT_MATH_CROPS = '1';
  const results: Record<string, unknown> = {};
  for (const upscale of [false, true]) {
    process.env.OCR_MATH_CELL_PIX2TEXT_UPSCALE = upscale ? '1' : '0';
    const key = upscale ? 'pix2text_upscale2x' : 'pix2text_original';
    const t0 = Date.now();
    const batch = await runMathCellPix2TextBatch({
      crops: TARGETS.map((l) => ({ label: l, buffer: crops[l].buffer })),
    });
    results[key] = {
      wallMs: Date.now() - t0,
      batches: batch.batches.map((b) => ({
        variant: b.variant,
        version: b.batch.version,
        loadMs: b.batch.loadMs,
        ok: b.batch.ok,
        error: b.batch.error,
        rows: b.rows,
      })),
    };
  }
  delete process.env.OCR_MATH_CELL_PIX2TEXT_UPSCALE;
  delete process.env.OCR_PIX2TEXT_MATH_CROPS;
  return results;
}

function scoreP57Variant(
  rows: Array<{ label: string; rawLatex: string; plainForFusion: string }>,
  gt: Array<{ label: string; text: string }>,
) {
  const by = new Map(rows.map((r) => [r.label, r]));
  return TARGETS.map((label) => {
    const row = by.get(label);
    const expected = gt.find((g) => g.label === label)?.text ?? '';
    const rawPlain = row?.plainForFusion ?? '';
    const rawLatex = row?.rawLatex ?? '';
    const norm = rawPlain ? normalizePix2TextPlain(rawPlain) : '';
    return {
      label,
      scoreRawPlain: scoreCellPrediction(label, expected, rawPlain),
      scoreNormalized: scoreCellPrediction(label, expected, norm),
      scoreLatexPlain: scoreCellPrediction(label, expected, pix2textPlainForFusion(rawLatex)),
    };
  });
}

async function runP43Snippet() {
  if (!existsSync(P43_IMAGE)) return null;
  const gt = JSON.parse(readFileSync(P43_GT, 'utf-8'));
  const cell = gt.cells[0];
  const region = gt.regionNorm as [number, number, number, number];
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
  const crop = await cropPageRegion(raw, box, 'original');
  writeFileSync(join(OUT, 'p43-lesson-math-crop.jpg'), crop);
  process.env.OCR_PIX2TEXT_MATH_CROPS = '1';
  process.env.OCR_MATH_CELL_PIX2TEXT_UPSCALE = '0';
  const t0 = Date.now();
  const batch = await runMathCellPix2TextBatch({
    crops: [{ label: 'a', buffer: crop }],
  });
  process.env.OCR_MATH_CELL_PIX2TEXT_UPSCALE = '0';
  process.env.OCR_PIX2TEXT_MATH_CROPS = '0';
  const row = batch.batches[0]?.rows[0];
  const expected = cell.text as string;
  return {
    imageSha256: await sha256(raw),
    cropHash: await sha256(crop),
    box,
    wallMs: Date.now() - t0,
    row,
    score: scoreCellPrediction('snippet', expected, row?.plainForFusion ?? ''),
    scoreNormalized: scoreCellPrediction('snippet', expected, row?.normalizedPlain ?? ''),
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const gt = JSON.parse(readFileSync(P57_GT, 'utf-8')).cells as Array<{ label: string; text: string }>;
  const reportD = JSON.parse(readFileSync(join(process.cwd(), 'var/math-cell-eval/p57/report-D.json'), 'utf-8'));
  const report64 = JSON.parse(readFileSync(join(process.cwd(), 'var/math-cell-eval/p57/report-6.4.json'), 'utf-8'));

  const { orientSha, crops } = await loadP57Crops();
  const pix2 = await runP57Pix2Variants(crops);

  const fusionRows: Record<string, unknown> = {};
  for (const label of TARGETS) {
    const origRows = (pix2.pix2text_original as { batches: Array<{ rows: unknown[] }> }).batches[0]?.rows ?? [];
    const pixCand = mathCellPix2TextCandidatesForFusion(label, origRows as import('../src/lessons/ocr-math-cell-pix2text').MathCellPix2TextRow[]);
    const tessRaw = reportD.D2_tesseractOnly?.[label]?.rawText ?? '';
    const paddleRaw = reportD.D1_paddleOnly?.[label]?.rawText ?? '';
    const fused = fuseCellOcrCandidates(label, [
      { engine: 'paddle', variant: 'original', rawText: paddleRaw, ms: 0 },
      { engine: 'tesseract', variant: 'original', rawText: tessRaw, ms: 0 },
      ...pixCand,
    ]);
    const expected = gt.find((g) => g.label === label)?.text ?? '';
    fusionRows[label] = {
      fusedText: fused?.text,
      strictMatch: fused ? strictCellExpressionMatches(fused.text.replace(/^[a-n]\.\s*/i, ''), expected) : false,
    };
  }

  const p43 = await runP43Snippet();

  const report = {
    experiment: '6.5',
    orientSha256: orientSha,
    pythonBinary: resolvePix2TextPythonBinary(),
    baseline: {
      reportD_strict: { paddle: 0, tesseract: 0 },
      report64_strict: report64.summaryTable,
    },
    cropHashes: Object.fromEntries(TARGETS.map((l) => [l, crops[l].hash])),
    cropBoundaryNote:
      'Baseline calibration crops saved; wide-proposal (+12% width) JPEGs for visual divisor check — geometry unchanged for scoring.',
    pix2,
    p57_scores: {
      original: scoreP57Variant(
        ((pix2.pix2text_original as { batches: Array<{ rows: unknown[] }> }).batches[0]?.rows ?? []) as Array<{
          label: string;
          rawLatex: string;
          plainForFusion: string;
        }>,
        gt,
      ),
      upscale2x: scoreP57Variant(
        ((pix2.pix2text_upscale2x as { batches: Array<{ rows: unknown[] }> }).batches[0]?.rows ?? []) as Array<{
          label: string;
          rawLatex: string;
          plainForFusion: string;
        }>,
        gt,
      ),
    },
    fusion: fusionRows,
    p43_snippet: p43,
    flags: {
      OCR_PIX2TEXT_MATH_CROPS: '1 during pix2 runs only',
      OCR_MATH_CELL_PIX2TEXT_UPSCALE: '1 for upscale variant batch',
      OCR_MATH_CELL_LAYOUT: '0 default',
    },
  };

  writeFileSync(join(OUT, 'report-6.5.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ out: join(OUT, 'report-6.5.json'), p57: report.p57_scores, p43: report.p43_snippet }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
