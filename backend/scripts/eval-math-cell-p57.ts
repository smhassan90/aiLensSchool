/**
 * Staged p57 evaluation: A=baseline, B=geometry only, C=OCR on validated crops.
 *
 * Usage (backend/):
 *   MATH_CELL_EXPERIMENT=A|B|C npx tsx scripts/eval-math-cell-p57.ts
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { prepareOrientedVariant } from '../src/lessons/page-image-prep';
import { PageOcrService } from '../src/lessons/page-ocr.service';
import { mergePageOcr } from '../src/lessons/ocr-layout-reconcile';
import { filterPageTextForLessonAssembly } from '../src/lessons/page-text-sanitize';
import { applyMathCellLayoutPipeline } from '../src/lessons/ocr-math-cell-pipeline';
import { detectDivideExerciseGridLayout } from '../src/lessons/ocr-math-cell-layout';
import {
  evaluateCellsStrict,
  evaluateCellsAgainstGroundTruth,
  strictCellExpressionMatches,
} from '../src/lessons/ocr-diagnostic/evaluate-ground-truth';
import { validateCellCropGeometry } from '../src/lessons/ocr-math-cell-geometry';
import { assessCellMappingGate } from '../src/lessons/ocr-math-cell-geometry-gate';
import { cropPageRegion } from '../src/lessons/ocr-region-image-prep';
import { imageDimensionsFromBuffer } from '../src/lessons/ocr-image-dimensions';
import { ocrMathCellCrop, releaseMathCellTesseractWorker } from '../src/lessons/ocr-math-cell-ocr';
import { fuseCellOcrCandidates } from '../src/lessons/ocr-math-cell-fusion';

const EXPECTED_ORIENT_SHA = '59172c0be72d8f78d8593bceb068cce4b9064a4f18750343a41a085020133dd1';
const IMAGE = join(process.cwd(), 'test-fixtures/fractions-chapter-calibration/p57-divide-grid.jpg');
const GT = join(process.cwd(), '../docs/ocr/ground_truth/p57-divide-grid.json');
const OUT = join(process.cwd(), 'var/math-cell-eval/p57');
const TARGETS = ['a', 'b', 'e', 'n'] as const;

async function main() {
  const experiment = (process.env.MATH_CELL_EXPERIMENT ?? 'ABC').toUpperCase();
  if (!existsSync(IMAGE)) {
    console.error('missing image', IMAGE);
    process.exit(2);
  }
  mkdirSync(OUT, { recursive: true });

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
  const gtCells = JSON.parse(readFileSync(GT, 'utf-8')).cells as Array<{ label: string; text: string }>;

  const report: Record<string, unknown> = {
    experiment,
    orientSha256: orientSha,
    dimensions: dims,
    variantMeta: { width: variant.width, height: variant.height },
  };

  let ruleMerged = '';
  let paddleLines: import('../src/lessons/ocr-structured-line').OcrStructuredLine[] = [];
  let tesseractLines: import('../src/lessons/ocr-structured-line').OcrStructuredLine[] = [];

  const runEngines = experiment === 'A' || experiment === 'C' || experiment === 'ABC' || experiment.includes('A');
  if (runEngines) {
    const pageOcr = new PageOcrService();
    const t0 = Date.now();
    const [engines] = await pageOcr.readPageOcrEnginesParallel(
      [{ buffer: orientBuf, mimetype: 'image/jpeg', originalname: 'orient.jpg' }],
      { subjectName: 'Mathematics' },
    );
    report.experimentA_engineMs = Date.now() - t0;
    paddleLines = engines.paddleLines ?? [];
    tesseractLines = engines.tesseractLines ?? [];
    ruleMerged = filterPageTextForLessonAssembly(
      mergePageOcr({
        paddle: engines.paddle,
        tesseract: engines.tesseract,
        paddleLines,
        tesseractLines,
        subjectName: 'Mathematics',
      }),
    );
    report.experimentA_baselineStrict = evaluateCellsStrict(ruleMerged, gtCells);
    report.experimentA_baselineLoose = evaluateCellsAgainstGroundTruth(ruleMerged, gtCells);
  }

  const layout = await detectDivideExerciseGridLayout({
    imageBuffer: orientBuf,
    pageWidth: dims.width,
    pageHeight: dims.height,
    transcript: ruleMerged || '7. Divide the following fractions',
    paddleLines,
    tesseractLines,
    testCaseId: 'p57-divide-grid',
  });
  report.layout = layout
    ? {
        gridBox: layout.gridBox,
        gridLines: layout.gridLines,
        cellCount: layout.cells.length,
        detectionMethods: layout.cells.map((c) => ({ label: c.label, d: c.detection })),
      }
    : null;

  const geometryReports: Record<string, unknown> = {};
  const mappingGate: Record<string, unknown> = {};
  const cropHashes: Record<string, string> = {};
  let geometryGatePassed = true;
  if (layout) {
    const storyY0 = layout.gridBox.y1 + 12;
    for (const label of TARGETS) {
      const cell = layout.cells.find((c) => c.label === label);
      if (!cell) {
        geometryReports[label] = { status: 'FAIL', reasons: ['cell_not_detected'] };
        mappingGate[label] = { status: 'FAIL', correctMapping: false };
        geometryGatePassed = false;
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
        storyBandY0: storyY0,
      });
      mappingGate[label] = gate;
      if (!gate.correctMapping || gate.status === 'FAIL') geometryGatePassed = false;
      const crop = await cropPageRegion(orientBuf, geom.paddedBox, 'original');
      cropHashes[label] = createHash('sha256').update(crop).digest('hex');
      writeFileSync(join(OUT, `crop-${label}-geom.jpg`), crop);
      geometryReports[label] = geom;
    }
  }
  report.experimentB_geometry = geometryReports;
  report.experimentB_mappingGate = mappingGate;
  report.experimentB_geometryGatePassed = geometryGatePassed;
  report.experimentB_cropSha256 = cropHashes;

  if ((experiment.includes('C') || experiment === 'ABC') && report.experimentB_geometryGatePassed) {
    process.env.OCR_MATH_CELL_LAYOUT = '1';
    process.env.OCR_PIX2TEXT_MATH_CROPS = '0';
    const timing: Record<string, number> = {};
    const tC0 = Date.now();
    const pipeline = await applyMathCellLayoutPipeline({
      imageBuffer: orientBuf,
      imageWidth: dims.width,
      imageHeight: dims.height,
      baseTranscript: ruleMerged,
      paddleLines,
      tesseractLines,
      subjectName: 'Mathematics',
      labelsOverride: [...TARGETS],
      testCaseId: 'p57-divide-grid',
    });
    timing.pipelineTotalMs = Date.now() - tC0;
    report.experimentC = {
      pipelineApplied: pipeline.applied,
      skippedReason: pipeline.skippedReason,
      timingMs: pipeline.timingMs,
      strict: pipeline.applied
        ? evaluateCellsStrict(pipeline.text, gtCells)
        : evaluateCellsStrict(ruleMerged, gtCells),
      perCell: gtCells.map((ref) => {
        const reading = pipeline.cells.find((c) => c.label === ref.label);
        const body = reading?.text.replace(/^[a-n]\.\s*/i, '') ?? '';
        return {
          label: ref.label,
          expected: ref.text,
          got: reading?.text ?? null,
          strictMatch: body ? strictCellExpressionMatches(body, ref.text) : false,
          source: reading?.source,
        };
      }),
    };

    const tSingle = Date.now();
    const cellA = layout?.cells.find((c) => c.label === 'a');
    if (cellA) {
      const geom = await validateCellCropGeometry({
        imageBuffer: orientBuf,
        pageWidth: dims.width,
        pageHeight: dims.height,
        label: 'a',
        box: cellA.box,
      });
      if (geom.status !== 'FAIL') {
        const c0 = Date.now();
        const one = await ocrMathCellCrop({
          imageBuffer: orientBuf,
          box: geom.paddedBox,
          subjectName: 'Mathematics',
          variants: ['upscale'],
        });
        timing.singleCellA_paddleTessMs = Date.now() - c0;
        timing.singleCellA_candidateCount = one.length;
        report.experimentC_singleCellProbe = one;
      }
    }
    await releaseMathCellTesseractWorker();
    timing.singleCellProbeWallMs = Date.now() - tSingle;
    report.experimentC_timing = timing;
  }

  const outPath = join(OUT, `report-${experiment}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  if (existsSync(join(OUT, 'report.json'))) {
    copyFileSync(join(OUT, 'report.json'), join(OUT, 'report-pre-6.1-backup.json'));
  }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outPath, orientSha, dims, summary: report.experimentA_baselineStrict, geometryReports }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
