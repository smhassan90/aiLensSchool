/**
 * Compare OCR variants A–D on fractions calibration pages (measured, not guessed).
 *
 *   A = Paddle page text
 *   B = Tesseract page text
 *   C = Portal rule merge (layout + finalize w/ OCR_AI_MERGE=0, region retry OFF)
 *   D = C + OCR_MATH_REGION_RETRY=1
 *   E = C + OCR_PIX2TEXT_MATH_CROPS=1 (optional; requires Pix2Text venv for live worker)
 *
 * Usage (from backend/):
 *   $env:OCR_AI_MERGE='0'
 *   npx tsx scripts/fractions-region-eval.ts [--page=p39-reduce] [--limit=3]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { prepareOrientedVariant } from '../src/lessons/page-image-prep';
import { PageOcrService } from '../src/lessons/page-ocr.service';
import { mergePageOcr } from '../src/lessons/ocr-layout-reconcile';
import { mergePaddleAndTesseractPageOcr } from '../src/lessons/merge-paddle-tesseract-ocr';
import { filterPageTextForLessonAssembly } from '../src/lessons/page-text-sanitize';
import { applyMathRegionRecovery } from '../src/lessons/ocr-math-region-recovery';
import {
  characterErrorRate,
  snippetFoundInTranscript,
  wordErrorRate,
} from '../src/lessons/ocr-calibration-metrics';
import { scoreFractionOcrText } from '../src/lessons/ocr-math-region-recovery';

const SUBJECT = 'Mathematics';

async function processPage(imagePath: string, snippets: string[]) {
  const buffer = readFileSync(imagePath);
  const file = {
    buffer,
    mimetype: 'image/jpeg',
    originalname: 'page.jpg',
    size: buffer.length,
  } as Express.Multer.File;
  const variant = await prepareOrientedVariant(file, 0);
  const ocrFile = {
    ...file,
    buffer: variant.ocr.buffer,
    mimetype: variant.ocr.mimeType,
    originalname: variant.ocr.originalname,
    size: variant.ocr.size,
  } as Express.Multer.File;

  const sharpModule = await import('sharp');
  const sharpFn =
    (sharpModule as { default?: (i: Buffer) => import('sharp').Sharp }).default ??
    (sharpModule as unknown as (i: Buffer) => import('sharp').Sharp);
  const meta = await sharpFn(ocrFile.buffer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;

  const ocr = new PageOcrService();
  const t0 = Date.now();
  const [{ paddle, tesseract, paddleLines, tesseractLines }] =
    await ocr.readPageOcrEnginesParallel([ocrFile], { subjectName: SUBJECT });
  const engineMs = Date.now() - t0;

  const A = paddle.trim();
  const B = tesseract.trim();
  const mergedRaw = mergePageOcr({
    paddle,
    tesseract,
    paddleLines,
    tesseractLines,
    subjectName: SUBJECT,
  });
  const C = filterPageTextForLessonAssembly(mergedRaw);

  const t1 = Date.now();
  const recovered = await applyMathRegionRecovery({
    imageBuffer: ocrFile.buffer,
    imageWidth: w,
    imageHeight: h,
    baseTranscript: C,
    paddleLines,
    tesseractLines,
    subjectName: SUBJECT,
  });
  const regionMs = Date.now() - t1;
  const D = filterPageTextForLessonAssembly(recovered.text);

  await ocr.onModuleDestroy?.();

  const ref = snippets.join('\n');
  const snippetHits = (text: string) =>
    snippets.filter((s) => snippetFoundInTranscript(s, text)).length / Math.max(1, snippets.length);

  return {
    engineMs,
    regionMs,
    variants: {
      A: { text: A, cer: ref ? characterErrorRate(A, ref) : null, wer: ref ? wordErrorRate(A, ref) : null, snippetHitRate: snippetHits(A), fracScore: scoreFractionOcrText(A) },
      B: { text: B, cer: ref ? characterErrorRate(B, ref) : null, wer: ref ? wordErrorRate(B, ref) : null, snippetHitRate: snippetHits(B), fracScore: scoreFractionOcrText(B) },
      C: { text: C, cer: ref ? characterErrorRate(C, ref) : null, wer: ref ? wordErrorRate(C, ref) : null, snippetHitRate: snippetHits(C), fracScore: scoreFractionOcrText(C) },
      D: {
        text: D,
        cer: ref ? characterErrorRate(D, ref) : null,
        wer: ref ? wordErrorRate(D, ref) : null,
        snippetHitRate: snippetHits(D),
        fracScore: scoreFractionOcrText(D),
        appliedRegions: recovered.appliedRegions,
        uncertainRegions: recovered.uncertainRegions,
      },
      E: { implemented: false, note: 'No specialized math model integrated in repo' },
    },
    legacyMergeChars: mergePaddleAndTesseractPageOcr(paddle, tesseract).length,
  };
}

async function main() {
  process.env.OCR_MATH_REGION_RETRY = '1';
  const root = join(process.cwd(), 'test-fixtures', 'fractions-chapter-calibration');
  const dataset = JSON.parse(readFileSync(join(root, 'chapter_dataset.json'), 'utf-8')) as {
    pages: Array<{
      id: string;
      image: string;
      verifiedSnippets: Array<{ text: string; reviewStatus: string }>;
    }>;
  };
  const onlyPage = process.argv.find((a) => a.startsWith('--page='))?.slice(7);
  const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.slice(8) ?? '0');
  let pages = dataset.pages;
  if (onlyPage) pages = pages.filter((p) => p.id === onlyPage);
  if (limit > 0) pages = pages.slice(0, limit);

  const outDir = join(root, 'region-eval-reports');
  mkdirSync(outDir, { recursive: true });
  const summary: Array<Record<string, unknown>> = [];

  for (const page of pages) {
    const imagePath = join(root, page.image);
    if (!existsSync(imagePath)) continue;
    const snippets = page.verifiedSnippets
      .filter((s) => s.reviewStatus === 'reference')
      .map((s) => s.text);
    console.log(`\n=== eval ${page.id} ===`);
    const report = await processPage(imagePath, snippets);
    const outPath = join(outDir, `${page.id}.json`);
    writeFileSync(outPath, JSON.stringify({ pageId: page.id, snippets, ...report }, null, 2));
    summary.push({
      pageId: page.id,
      engineMs: report.engineMs,
      regionMs: report.regionMs,
      snippetHit_C: report.variants.C.snippetHitRate,
      snippetHit_D: report.variants.D.snippetHitRate,
      fracScore_C: report.variants.C.fracScore,
      fracScore_D: report.variants.D.fracScore,
      appliedRegions: (report.variants.D as { appliedRegions?: string[] }).appliedRegions,
    });
    console.log(JSON.stringify(summary[summary.length - 1], null, 2));
  }

  writeFileSync(join(outDir, '_summary.json'), JSON.stringify({ generatedAt: new Date().toISOString(), summary }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
