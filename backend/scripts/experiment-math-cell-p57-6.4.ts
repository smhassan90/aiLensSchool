/**
 * Phase 6.4: upscale Paddle + Pix2Text on fixed calibrated p57 crops.
 * Usage: npx tsx scripts/experiment-math-cell-p57-6.4.ts
 */
import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { prepareOrientedVariant } from '../src/lessons/page-image-prep';
import { detectDivideExerciseGridLayout } from '../src/lessons/ocr-math-cell-layout';
import { validateCellCropGeometry, padCellBox } from '../src/lessons/ocr-math-cell-geometry';
import { cropPageRegion } from '../src/lessons/ocr-region-image-prep';
import { imageDimensionsFromBuffer } from '../src/lessons/ocr-image-dimensions';
import { runPaddleOcrOnBuffer } from '../src/lessons/paddle-ocr.runner';
import { runPix2TextOnCrops } from '../src/lessons/pix2text-math.runner';
import { strictCellExpressionMatches } from '../src/lessons/ocr-diagnostic/evaluate-ground-truth';
import { pix2textPlainForFusion, normalizePix2TextPlain } from '../src/lessons/ocr-pix2text-latex-plain';
import { fuseCellOcrCandidates } from '../src/lessons/ocr-math-cell-fusion';
import { assessCellMappingGate } from '../src/lessons/ocr-math-cell-geometry-gate';

const EXPECTED_ORIENT_SHA = '59172c0be72d8f78d8593bceb068cce4b9064a4f18750343a41a085020133dd1';
const IMAGE = join(process.cwd(), 'test-fixtures/fractions-chapter-calibration/p57-divide-grid.jpg');
const GT = join(process.cwd(), '../docs/ocr/ground_truth/p57-divide-grid.json');
const OUT = join(process.cwd(), 'var/math-cell-eval/p57');
const REPORT_D = join(OUT, 'report-D.json');
const REPORT_B = join(OUT, 'report-B.json');
const TARGETS = ['a', 'b', 'e', 'n'] as const;

/** Phase 6.6 geometry (padded crop bytes). Prior 6.3 hashes in report-6.6.json `cropHashBefore`. */
const EXPECTED_CROP_SHA: Record<string, string> = {
  a: '4628360bba0f9f8ab970fa29078cb7452b5874738ad80d1ec2b73c15a46d4157',
  b: '7d826efd38186c83e459568e2acf4359cf9ca7768149cc4c613b8abba0e64c95',
  e: '3064d74830ef1a66933ee310f93c69cb43494f9374668da6c24e8bbb25e0f24e',
  n: '9bc8efb125fed0190ab9cc191517b6953d002dcc74880ea46ef64ac9d7d151ca',
};

type Variant = 'original' | 'upscale2x' | 'upscale3x';

async function upscaleBuffer(buf: Buffer, factor: number): Promise<Buffer> {
  const sharpModule = await import('sharp');
  const sharp =
    (sharpModule as { default?: (i: Buffer) => import('sharp').Sharp }).default ??
    (sharpModule as unknown as (i: Buffer) => import('sharp').Sharp);
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  return sharp(buf)
    .resize({
      width: Math.round(w * factor),
      height: Math.round(h * factor),
      kernel: 'lanczos3',
    })
    .jpeg({ quality: 92 })
    .toBuffer();
}

function strictFromRaw(raw: string, expected: string): boolean {
  const plain = normalizePix2TextPlain(raw);
  return strictCellExpressionMatches(plain, expected);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const gtCells = JSON.parse(readFileSync(GT, 'utf-8')).cells as Array<{ label: string; text: string }>;
  const gtBy = new Map(gtCells.map((c) => [c.label, c.text]));

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
    console.error('orient sha mismatch', orientSha);
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
    console.error('layout missing');
    process.exit(4);
  }

  const originals: Record<string, Buffer> = {};
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
    const gate = assessCellMappingGate({
      label,
      box: cell.box,
      gridBox: layout.gridBox,
      geometry: geom,
      storyBandY0: layout.gridBox.y1 + 12,
    });
    if (!gate.correctMapping || gate.status === 'FAIL') {
      console.error('geometry gate failed for', label, gate);
      process.exit(5);
    }
    const crop = await cropPageRegion(orientBuf, geom.paddedBox, 'original');
    const hash = createHash('sha256').update(crop).digest('hex');
    if (hash !== EXPECTED_CROP_SHA[label]) {
      console.error('crop hash mismatch', label, { got: hash, expected: EXPECTED_CROP_SHA[label] });
      process.exit(6);
    }
    originals[label] = crop;
    writeFileSync(join(OUT, `6.4-crop-${label}-original.jpg`), crop);
  }

  const baselineD = existsSync(REPORT_D) ? JSON.parse(readFileSync(REPORT_D, 'utf-8')) : null;

  const paddleByVariant: Record<Variant, Record<string, unknown>> = {
    original: {},
    upscale2x: {},
    upscale3x: {},
  };
  const variantTiming: Record<string, number> = {};
  const variants: Variant[] = ['original', 'upscale2x', 'upscale3x'];

  for (const v of variants) {
    const tVar = Date.now();
    for (const label of TARGETS) {
      const orig = originals[label];
      let buf = orig;
      let factor = 1;
      let interpolation = 'none';
      if (v === 'upscale2x') {
        factor = 2;
        interpolation = 'lanczos3';
        buf = await upscaleBuffer(orig, 2);
      } else if (v === 'upscale3x') {
        factor = 3;
        interpolation = 'lanczos3';
        buf = await upscaleBuffer(orig, 3);
      }
      writeFileSync(join(OUT, `6.4-crop-${label}-${v}.jpg`), buf);
      const cropHash = createHash('sha256').update(buf).digest('hex');
      const meta = await import('sharp').then((m) => {
        const s = m.default ?? m;
        return s(buf).metadata();
      });
      const t0 = Date.now();
      const result = await runPaddleOcrOnBuffer(
        { buffer: buf, mimetype: 'image/jpeg', originalname: `${label}-${v}.jpg` },
        { subjectName: 'Mathematics' },
      );
      const ms = Date.now() - t0;
      const conf =
        result.lines?.map((l) => l.confidence).filter((c): c is number => typeof c === 'number') ?? [];
      const expected = gtBy.get(label) ?? '';
      paddleByVariant[v][label] = {
        sourceCropSha256: EXPECTED_CROP_SHA[label],
        transformedCropSha256: cropHash,
        width: meta.width,
        height: meta.height,
        scaleFactor: factor,
        interpolation,
        rawText: result.text,
        ok: result.ok,
        error: result.error,
        confidenceMin: conf.length ? Math.min(...conf) : null,
        confidenceMax: conf.length ? Math.max(...conf) : null,
        inferenceMs: ms,
        strictMatch: strictFromRaw(result.text, expected),
      };
    }
    variantTiming[`paddle_${v}_totalMs`] = Date.now() - tVar;
  }

  const pixWall = Date.now();
  const pixBatch = await runPix2TextOnCrops(
    TARGETS.map((label) => ({ id: label, buffer: originals[label] })),
  );
  const pixTotalMs = Date.now() - pixWall;
  const pix2textByCell: Record<string, unknown> = {};
  let pixValidInference = false;
  for (const row of pixBatch.results) {
    const raw = row.text ?? '';
    const bytes = raw.length;
    const looksStub = bytes < 200 && !raw.includes('\\frac') && !raw.includes('÷') && !/\d+\s*\/\s*\d+/.test(raw);
    if (row.ok && bytes > 200) pixValidInference = true;
    if (row.ok && (raw.includes('\\frac') || raw.includes('÷') || /\d+\/\d+/.test(raw))) pixValidInference = true;
    const expected = gtBy.get(row.id) ?? '';
    pix2textByCell[row.id] = {
      ok: row.ok,
      rawText: raw,
      rawBytes: bytes,
      inferenceMs: row.ms,
      loadMs: pixBatch.loadMs,
      version: pixBatch.version,
      error: row.error,
      plainForFusion: pix2textPlainForFusion(raw),
      strictMatch: strictFromRaw(pix2textPlainForFusion(raw), expected),
      likelyStub: looksStub && row.ok,
    };
  }
  if (!pixBatch.ok) {
    pix2textByCell._batchError = pixBatch.error;
  }

  const fusion: Record<string, unknown> = {};
  let fusionHits = 0;
  for (const label of TARGETS) {
    const expected = gtBy.get(label) ?? '';
    const bestPaddle = ['upscale3x', 'upscale2x', 'original'].find((v) => {
      const row = paddleByVariant[v as Variant][label] as { strictMatch?: boolean };
      return row?.strictMatch;
    });
    const paddleVariant = (bestPaddle ?? 'original') as Variant;
    const pRow = paddleByVariant[paddleVariant][label] as { rawText: string };
    const tessRaw =
      (baselineD?.D2_tesseractOnly?.[label] as { rawText?: string })?.rawText ?? '';
    const pixRaw = (pix2textByCell[label] as { rawText?: string })?.rawText ?? '';
    const fused = fuseCellOcrCandidates(label, [
      { engine: 'paddle', variant: 'original', rawText: pRow.rawText, ms: 0 },
      { engine: 'tesseract', variant: 'original', rawText: tessRaw, ms: 0 },
      { engine: 'pix2text', variant: 'original', rawText: pixRaw, ms: 0 },
    ]);
    const body = fused?.text.replace(/^[a-n]\.\s*/i, '') ?? '';
    const match = body ? strictCellExpressionMatches(body, expected) : false;
    if (match) fusionHits += 1;
    fusion[label] = {
      fusedText: fused?.text ?? null,
      strictMatch: match,
      paddleVariantUsed: paddleVariant,
    };
  }

  const scoreRow = (engine: string, variant: string, cells: Record<string, { strictMatch?: boolean }>) => {
    const hits = TARGETS.filter((l) => cells[l]?.strictMatch).length;
    return { engine, variant, hits, cells: TARGETS.map((l) => cells[l]?.strictMatch ?? false) };
  };

  const summaryTable = [
    scoreRow(
      'paddle',
      'original',
      TARGETS.reduce(
        (acc, l) => {
          acc[l] = paddleByVariant.original[l] as { strictMatch?: boolean };
          return acc;
        },
        {} as Record<string, { strictMatch?: boolean }>,
      ),
    ),
    scoreRow(
      'paddle',
      'upscale2x',
      TARGETS.reduce(
        (acc, l) => {
          acc[l] = paddleByVariant.upscale2x[l] as { strictMatch?: boolean };
          return acc;
        },
        {} as Record<string, { strictMatch?: boolean }>,
      ),
    ),
    scoreRow(
      'paddle',
      'upscale3x',
      TARGETS.reduce(
        (acc, l) => {
          acc[l] = paddleByVariant.upscale3x[l] as { strictMatch?: boolean };
          return acc;
        },
        {} as Record<string, { strictMatch?: boolean }>,
      ),
    ),
    {
      engine: 'tesseract',
      variant: 'original (phase D)',
      hits: TARGETS.filter(
        (l) => baselineD?.D3_comparison?.find((r: { cell: string }) => r.cell === l)?.tesseractExact,
      ).length,
      note: 'from report-D.json',
    },
    {
      engine: 'pix2text',
      variant: 'original',
      hits: TARGETS.filter((l) => (pix2textByCell[l] as { strictMatch?: boolean })?.strictMatch).length,
      validInference: pixValidInference,
      version: pixBatch.version,
    },
    { engine: 'fusion', variant: 'best-paddle+tess+pix2text', hits: fusionHits },
  ];

  const report = {
    experiment: '6.4',
    orientSha256: orientSha,
    cropSha256Verified: EXPECTED_CROP_SHA,
    phaseD_baseline: baselineD
      ? {
          paddleOriginalHits: TARGETS.filter(
            (l) => (baselineD.D1_paddleOnly?.[l] as { strictMatch?: boolean })?.strictMatch,
          ).length,
          tesseractHits: TARGETS.filter(
            (l) => baselineD.D3_comparison?.find((r: { cell: string; tesseractExact: boolean }) => r.cell === l)?.tesseractExact,
          ).length,
        }
      : null,
    paddleByVariant,
    variantTiming,
    pix2text: {
      batchOk: pixBatch.ok,
      version: pixBatch.version,
      loadMs: pixBatch.loadMs,
      totalWallMs: pixTotalMs,
      validInference: pixValidInference,
      byCell: pix2textByCell,
    },
    fusion,
    summaryTable,
    timing: {
      ...variantTiming,
      pix2textTotalMs: pixTotalMs,
      note: 'Each Paddle variant runs 4 sequential worker spawns (no reuse).',
    },
  };

  const outPath = join(OUT, 'report-6.4.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outPath, summaryTable, pixValidInference, pixVersion: pixBatch.version }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
