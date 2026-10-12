/**

 * Run the real chapter-page OCR path with diagnostic artifacts.

 *

 * Usage (from backend/):

 *   OCR_DIAGNOSTIC=1 npx tsx scripts/ocr-pipeline-diagnose.ts <imagePath> [testCaseId] [subjectName]

 *

 * Artifacts: OCR_DIAGNOSTIC_DIR/<correlationId>/manifest.json

 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

import { join } from 'path';

import { requireOcrDiagnosticModule } from './ocr-diagnostic-module-path';



type StandaloneMod = {

  runStandaloneDiagnosticChapterPage: (input: {

    file: Express.Multer.File;

    subjectName: string;

    testCaseId?: string;

  }) => Promise<{

    correlationId: string;

    manifestPath: string | null;

    paddle: string;

    tesseract: string;

    ocrText: string;

    mergedOcrText: string;

  }>;

};



type HashMod = { sha256Buffer: (buf: Buffer) => string };

type ArtifactsMod = {

  imageMeta: (buf: Buffer) => Promise<{

    width?: number;

    height?: number;

    format?: string;

    orientation?: number;

  }>;

};

type EvalMod = {

  evaluateCellsAgainstGroundTruth: (

    ocrText: string,

    cells: Array<{ label: string; text: string }>,

  ) => {

    exactCellHits: number;

    cellTotal: number;

    missingLabels: string[];

    wrongLabels: string[];

  };

  GroundTruthDoc: { cells?: Array<{ label: string; text: string }> };

};



async function main() {

  process.env.OCR_DIAGNOSTIC = '1';

  const { runStandaloneDiagnosticChapterPage } =

    requireOcrDiagnosticModule<StandaloneMod>('standalone-chapter-page');

  const { sha256Buffer } = requireOcrDiagnosticModule<HashMod>('hash');

  const { imageMeta } = requireOcrDiagnosticModule<ArtifactsMod>('artifacts');

  const { evaluateCellsAgainstGroundTruth } = requireOcrDiagnosticModule<EvalMod>(

    'evaluate-ground-truth',

  );



  const imagePath = process.argv[2];

  const testCaseId = process.argv[3] || 'unspecified';

  const subjectName = process.argv[4] || 'Mathematics';

  if (!imagePath || !existsSync(imagePath)) {

    console.error(

      'Usage: OCR_DIAGNOSTIC=1 tsx scripts/ocr-pipeline-diagnose.ts <imagePath> [testCaseId] [subject]',

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

    } as Express.Multer.File,

    subjectName,

    testCaseId,

  });



  const gtPath = join(process.cwd(), '..', 'docs', 'ocr', 'ground_truth', `${testCaseId}.json`);

  const gtAlt = join(process.cwd(), 'docs', 'ocr', 'ground_truth', `${testCaseId}.json`);

  const gtP40 = join(process.cwd(), '..', 'docs', 'ocr', 'ground_truth', 'p40-add-portal-upload.json');

  let gtFile = existsSync(gtPath) ? gtPath : existsSync(gtAlt) ? gtAlt : null;

  if (!gtFile && testCaseId.startsWith('p40') && existsSync(gtP40)) gtFile = gtP40;

  let metrics: Record<string, unknown> = {};

  if (gtFile) {

    const gt = JSON.parse(readFileSync(gtFile, 'utf-8')) as EvalMod['GroundTruthDoc'];

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

    featureFlags: process.env.OCR_DIAGNOSTIC === '1',

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


