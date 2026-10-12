/**
 * Production-safe diagnostic runner (CommonJS — works with ts-node in the backend container).
 */
const { readFileSync, writeFileSync, existsSync } = require('fs');
const { join } = require('path');
const { requireOcrDiagnosticModule } = require('./ocr-diagnostic-module-path.cjs');

async function main() {
  process.env.OCR_DIAGNOSTIC = '1';
  const { runStandaloneDiagnosticChapterPage } = requireOcrDiagnosticModule(
    'standalone-chapter-page',
  );
  const { sha256Buffer } = requireOcrDiagnosticModule('hash');
  const { imageMeta } = requireOcrDiagnosticModule('artifacts');
  const { evaluateCellsAgainstGroundTruth } = requireOcrDiagnosticModule('evaluate-ground-truth');

  const imagePath = process.argv[2];
  const testCaseId = process.argv[3] || 'unspecified';
  const subjectName = process.argv[4] || 'Mathematics';
  if (!imagePath || !existsSync(imagePath)) {
    console.error(
      'Usage: OCR_DIAGNOSTIC=1 node scripts/ocr-pipeline-diagnose.cjs <imagePath> [testCaseId] [subject]',
    );
    process.exit(2);
  }

  const buffer = readFileSync(imagePath);
  const inputSha = sha256Buffer(buffer);
  const meta = await imageMeta(buffer);

  const result = await runStandaloneDiagnosticChapterPage({
    file: {
      buffer,
      mimetype: 'image/jpeg',
      originalname: imagePath.split(/[/\\]/).pop() ?? 'page.jpg',
      size: buffer.length,
    },
    subjectName,
    testCaseId,
  });

  const gtPath = join(process.cwd(), '..', 'docs', 'ocr', 'ground_truth', `${testCaseId}.json`);
  const gtAlt = join(process.cwd(), 'docs', 'ocr', 'ground_truth', `${testCaseId}.json`);
  let gtFile = existsSync(gtPath) ? gtPath : existsSync(gtAlt) ? gtAlt : null;
  let metrics = {};
  if (gtFile) {
    const gt = JSON.parse(readFileSync(gtFile, 'utf-8'));
    if (gt.cells?.length) {
      metrics = {
        cells: evaluateCellsAgainstGroundTruth(result.mergedOcrText, gt.cells),
        evaluatedField: 'mergedOcrText',
      };
    }
  }

  const summary = {
    testCaseId,
    correlationId: result.correlationId,
    manifestPath: result.manifestPath,
    input: { path: imagePath, sha256: inputSha, ...meta, bytes: buffer.length },
    output: {
      paddleChars: result.paddle.length,
      tesseractChars: result.tesseract.length,
      ocrTextChars: result.ocrText.length,
      mergedChars: result.mergedOcrText.length,
    },
    buildSha: process.env.BUILD_SHA ?? null,
    metrics,
  };

  const outPath = result.manifestPath
    ? join(result.manifestPath.replace(/manifest\.json$/, ''), 'run-summary.json')
    : join(process.cwd(), 'var', 'ocr-diagnostic', 'run-summary.json');
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
