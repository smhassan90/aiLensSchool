/**
 * Baseline (C merge) vs Pix2Text fusion (F) on annotated calibration pages.
 * Mock worker by default; pass --live-pix2text to call the real venv worker.
 *
 *   npx tsx scripts/fractions-pix2text-fusion-eval.ts
 *   npx tsx scripts/fractions-pix2text-fusion-eval.ts --live-pix2text
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { prepareOrientedVariant } from '../src/lessons/page-image-prep';
import { PageOcrService } from '../src/lessons/page-ocr.service';
import { mergePageOcr } from '../src/lessons/ocr-layout-reconcile';
import { filterPageTextForLessonAssembly } from '../src/lessons/page-text-sanitize';
import { applyPix2TextMathCropFusion } from '../src/lessons/ocr-pix2text-math-fusion';
import { normalizePix2TextPlain } from '../src/lessons/ocr-pix2text-latex-plain';
import {
  characterErrorRate,
  snippetFoundInTranscript,
} from '../src/lessons/ocr-calibration-metrics';

const SUBJECT = 'Mathematics';
const PAGES = ['p39-reduce', 'p57-divide-grid', 'p43-mult-whole'];

function exerciseHit(text: string, label: string, expected: string): boolean {
  const t = normalizePix2TextPlain(text).toLowerCase();
  const e = normalizePix2TextPlain(expected).toLowerCase();
  const near = t.replace(/\s/g, '');
  const exp = e.replace(/\s/g, '');
  return near.includes(`${label}.`) && near.includes(exp);
}

async function main() {
  const live = process.argv.includes('--live-pix2text');
  process.env.OCR_AI_MERGE = '0';
  process.env.OCR_MATH_REGION_RETRY = '0';
  process.env.OCR_PIX2TEXT_MATH_CROPS = '1';

  const root = join(process.cwd(), 'test-fixtures', 'fractions-chapter-calibration');
  const dataset = JSON.parse(readFileSync(join(root, 'chapter_dataset.json'), 'utf-8')) as {
    pages: Array<{
      id: string;
      image: string;
      verifiedSnippets: Array<{ text: string; reviewStatus: string }>;
      exerciseItems?: Array<{ label: string; text: string; reviewStatus: string }>;
    }>;
  };

  const outDir = join(root, 'pix2text-fusion-eval-reports');
  mkdirSync(outDir, { recursive: true });
  const summary: Record<string, unknown>[] = [];

  for (const pageId of PAGES) {
    const page = dataset.pages.find((p) => p.id === pageId);
    if (!page) continue;
    const imagePath = join(root, page.image);
    if (!existsSync(imagePath)) continue;

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

    const C = filterPageTextForLessonAssembly(
      mergePageOcr({
        paddle,
        tesseract,
        paddleLines,
        tesseractLines,
        subjectName: SUBJECT,
      }),
    );

    let runWorker: typeof import('../src/lessons/pix2text-math.runner').runPix2TextOnCrops | undefined;
    if (!live) {
      const fixturePath = join(
        process.cwd(),
        'eval',
        'specialized-math-ocr',
        'outputs',
        `${pageId === 'p57-divide-grid' ? 'p57-divide-grid__divide_grid__pix2text.txt' : ''}`,
      );
      const mockText =
        pageId === 'p57-divide-grid' && existsSync(fixturePath)
          ? readFileSync(fixturePath, 'utf-8')
          : '';
      runWorker = async () => ({
        ok: Boolean(mockText),
        results: mockText
          ? [{ id: 'exercise_band', ok: true, text: mockText, ms: 0 }]
          : [],
        error: mockText ? undefined : 'mock_no_fixture',
      });
    }

    const t1 = Date.now();
    const fused = await applyPix2TextMathCropFusion({
      imageBuffer: ocrFile.buffer,
      imageWidth: w,
      imageHeight: h,
      baseTranscript: C,
      paddleLines,
      tesseractLines,
      subjectName: SUBJECT,
      runWorker,
    });
    const fusionMs = Date.now() - t1;
    const F = filterPageTextForLessonAssembly(fused.text);

    const snippets = page.verifiedSnippets
      .filter((s) => s.reviewStatus === 'reference')
      .map((s) => s.text);
    const exercises = (page.exerciseItems ?? []).filter((e) => e.reviewStatus === 'reference');

    const snippetHitsC = snippets.filter((s) => snippetFoundInTranscript(s, C)).length;
    const snippetHitsF = snippets.filter((s) => snippetFoundInTranscript(s, F)).length;
    const exHitsC = exercises.filter((e) => exerciseHit(C, e.label, e.text)).length;
    const exHitsF = exercises.filter((e) => exerciseHit(F, e.label, e.text)).length;

    const refJoin = [...snippets, ...exercises.map((e) => e.text)].join('\n');
    const row = {
      pageId,
      livePix2Text: live,
      engineMs,
      fusionMs,
      baselineC: {
        snippetHits: `${snippetHitsC}/${snippets.length}`,
        exerciseHits: `${exHitsC}/${exercises.length}`,
        cer: refJoin ? characterErrorRate(C, refJoin) : null,
      },
      fusionF: {
        snippetHits: `${snippetHitsF}/${snippets.length}`,
        exerciseHits: `${exHitsF}/${exercises.length}`,
        cer: refJoin ? characterErrorRate(F, refJoin) : null,
        appliedRegions: fused.appliedRegions,
        skippedRegions: fused.skippedRegions,
        workerError: fused.workerError,
      },
      note:
        pageId === 'p39-reduce'
          ? 'p39 full solution REQUIRES_ANNOTATION — snippet-only metrics'
          : pageId === 'p57-divide-grid'
            ? 'exercise hits cover a,b,e,n only — not full grid'
            : 'snippet-level reference',
    };
    summary.push(row);
    writeFileSync(
      join(outDir, `${pageId}.json`),
      JSON.stringify({ ...row, textC: C, textF: F, pix2textOutputs: fused.pix2textOutputs }, null, 2),
    );
    console.log(JSON.stringify(row, null, 2));
    await ocr.onModuleDestroy?.();
  }

  const report = {
    generatedAt: new Date().toISOString(),
    livePix2Text: live,
    summary,
    recommendation:
      'Do not enable in production by default. p57 mock/live fusion can improve curated cells; p39 needs annotation.',
  };
  writeFileSync(join(outDir, '_summary.json'), JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
