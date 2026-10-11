/**
 * Batch OCR calibration for Oxford Fractions chapter photos.
 * Usage:
 *   npx tsx scripts/fractions-chapter-calibrate.ts [--page=id] [--limit=N]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { PageOcrService } from '../src/lessons/page-ocr.service';
import { mergePaddleAndTesseractPageOcr } from '../src/lessons/merge-paddle-tesseract-ocr';
import { mergePageOcr, reconcilePageOcr } from '../src/lessons/ocr-layout-reconcile';
import { filterPageTextForLessonAssembly } from '../src/lessons/page-text-sanitize';
import {
  characterErrorRate,
  classifySnippetFailure,
  exactExerciseItemMatch,
  snippetFoundInTranscript,
  type CalibrationFailureCategory,
} from '../src/lessons/ocr-calibration-metrics';
import { pythonBinary, workerScriptPath } from './fractions-calibrate-env';

type DatasetPage = {
  id: string;
  bookPage: number | null;
  image: string;
  layout: string;
  verifiedSnippets: Array<{
    id: string;
    text: string;
    regionType: string;
    reviewStatus: string;
  }>;
  exerciseItems: Array<{
    label: string;
    text: string;
    regionType: string;
    reviewStatus: string;
  }>;
};

type PaddleLine = { text: string; x0: number; y0: number; x1: number; y1: number };

async function runPaddleDetailed(imagePath: string): Promise<{
  text: string;
  lines: PaddleLine[];
  recModel: string;
  ms: number;
  error?: string;
}> {
  const started = Date.now();
  const script = workerScriptPath();
  const args = [script, '--image', imagePath, '--lang', 'en', '--include-lines'];
  return new Promise((resolve) => {
    const child = spawn(pythonBinary(), args, {
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => {
      stdout += c.toString('utf8');
    });
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString('utf8');
    });
    child.on('close', () => {
      const ms = Date.now() - started;
      const last = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .pop();
      if (!last) {
        resolve({ text: '', lines: [], recModel: 'unknown', ms, error: stderr || 'empty stdout' });
        return;
      }
      try {
        const parsed = JSON.parse(last) as {
          ok?: boolean;
          text?: string;
          lines?: PaddleLine[];
          recModel?: string;
          error?: string;
        };
        if (!parsed.ok) {
          resolve({
            text: '',
            lines: [],
            recModel: parsed.recModel ?? 'unknown',
            ms,
            error: parsed.error,
          });
          return;
        }
        resolve({
          text: (parsed.text ?? '').trim(),
          lines: parsed.lines ?? [],
          recModel: parsed.recModel ?? 'stock_en',
          ms,
        });
      } catch (e) {
        resolve({
          text: '',
          lines: [],
          recModel: 'unknown',
          ms,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    });
  });
}

async function portalEngines(imagePath: string) {
  const buffer = readFileSync(imagePath);
  const file = {
    buffer,
    mimetype: 'image/jpeg',
    originalname: 'page.jpg',
    size: buffer.length,
  } as Express.Multer.File;
  const ocr = new PageOcrService();
  const t0 = Date.now();
  const [{ paddle, tesseract, paddleLines, tesseractLines }] =
    await ocr.readPageOcrEnginesParallel([file], {
      subjectName: 'Mathematics',
    });
  const tessMs = Date.now() - t0;
  const legacyMergedRaw = mergePaddleAndTesseractPageOcr(paddle, tesseract);
  const layoutMergedRaw = mergePageOcr({
    paddle,
    tesseract,
    paddleLines,
    tesseractLines,
    subjectName: 'Mathematics',
  });
  const reconcileMeta = reconcilePageOcr({
    paddle,
    tesseract,
    paddleLines,
    tesseractLines,
    subjectName: 'Mathematics',
  });
  const merged = filterPageTextForLessonAssembly(layoutMergedRaw);
  const legacyMerged = filterPageTextForLessonAssembly(legacyMergedRaw);
  await ocr.onModuleDestroy?.();
  return {
    paddle,
    tesseract,
    merged,
    legacyMerged,
    usedLayoutReconcile: reconcileMeta.usedLayoutReconcile,
    tessMs,
    paddleLines,
    tesseractLines,
  };
}

async function main() {
  const root = join(process.cwd(), 'test-fixtures', 'fractions-chapter-calibration');
  const datasetPath = join(root, 'chapter_dataset.json');
  const dataset = JSON.parse(readFileSync(datasetPath, 'utf-8')) as {
    pages: DatasetPage[];
  };
  const onlyPage = process.argv.find((a) => a.startsWith('--page='))?.slice(7);
  const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.slice(8) ?? '0');
  let pages = dataset.pages;
  if (onlyPage) pages = pages.filter((p) => p.id === onlyPage);
  if (limit > 0) pages = pages.slice(0, limit);

  const outDir = join(root, 'reports');
  mkdirSync(outDir, { recursive: true });

  const summary: Array<Record<string, unknown>> = [];

  for (const page of pages) {
    const imagePath = join(root, page.image);
    if (!existsSync(imagePath)) {
      console.warn(`Skip ${page.id}: missing ${page.image}`);
      continue;
    }
    console.log(`\n=== ${page.id} (${page.image}) ===`);
    const paddleDetail = await runPaddleDetailed(imagePath);
    const engines = await portalEngines(imagePath);
    const failures: Array<{ kind: string; detail: string; category: CalibrationFailureCategory }> =
      [];

    for (const snip of page.verifiedSnippets) {
      if (snip.reviewStatus !== 'reference') continue;
      const ok = snippetFoundInTranscript(snip.text, engines.merged);
      if (!ok) {
        failures.push({
          kind: 'snippet',
          detail: `${snip.id}: "${snip.text}"`,
          category: classifySnippetFailure(
            snip.text,
            engines.paddle,
            engines.tesseract,
            engines.merged,
          ),
        });
      }
    }

    const exerciseResults: Array<{
      label: string;
      expected: string;
      exactInMerged: boolean;
      exactInPaddle: boolean;
      exactInTess: boolean;
    }> = [];
    for (const item of page.exerciseItems) {
      if (item.reviewStatus !== 'reference') continue;
      exerciseResults.push({
        label: item.label,
        expected: item.text,
        exactInMerged: exactExerciseItemMatch(item.label, item.text, engines.merged),
        exactInPaddle: exactExerciseItemMatch(item.label, item.text, engines.paddle),
        exactInTess: exactExerciseItemMatch(item.label, item.text, engines.tesseract),
      });
      if (!exactExerciseItemMatch(item.label, item.text, engines.merged)) {
        failures.push({
          kind: 'exercise_item',
          detail: `${item.label}: ${item.text}`,
          category: classifySnippetFailure(
            item.text,
            engines.paddle,
            engines.tesseract,
            engines.merged,
          ),
        });
      }
    }

    const report = {
      pageId: page.id,
      bookPage: page.bookPage,
      layout: page.layout,
      image: page.image,
      models: {
        paddleRec: paddleDetail.recModel,
        paddleMs: paddleDetail.ms,
        tesseractMs: engines.tessMs,
      },
      paddleText: paddleDetail.text || engines.paddle,
      tesseractText: engines.tesseract,
      mergedText: engines.merged,
      legacyMergedText: engines.legacyMerged,
      usedLayoutReconcile: engines.usedLayoutReconcile,
      paddleLines: paddleDetail.lines.length ? paddleDetail.lines : engines.paddleLines,
      tesseractLines: engines.tesseractLines,
      metricsByVariant: {
        paddleCER: page.verifiedSnippets[0]?.reviewStatus === 'reference'
          ? characterErrorRate(engines.paddle, page.verifiedSnippets.map((s) => s.text).join('\n'))
          : null,
        tesseractCER: page.verifiedSnippets[0]?.reviewStatus === 'reference'
          ? characterErrorRate(engines.tesseract, page.verifiedSnippets.map((s) => s.text).join('\n'))
          : null,
        legacyMergeCER: page.verifiedSnippets[0]?.reviewStatus === 'reference'
          ? characterErrorRate(engines.legacyMerged, page.verifiedSnippets.map((s) => s.text).join('\n'))
          : null,
        layoutMergeCER: page.verifiedSnippets[0]?.reviewStatus === 'reference'
          ? characterErrorRate(engines.merged, page.verifiedSnippets.map((s) => s.text).join('\n'))
          : null,
      },
      verifiedSnippets: page.verifiedSnippets,
      exerciseItems: page.exerciseItems,
      exerciseResults,
      failures,
      needsHumanVerification: failures.length > 0,
      metrics: {
        snippetHitRate:
          page.verifiedSnippets.filter((s) => s.reviewStatus === 'reference').length > 0
            ? page.verifiedSnippets
                .filter((s) => s.reviewStatus === 'reference')
                .filter((s) => snippetFoundInTranscript(s.text, engines.merged)).length /
              page.verifiedSnippets.filter((s) => s.reviewStatus === 'reference').length
            : null,
        exerciseExactRate:
          exerciseResults.length > 0
            ? exerciseResults.filter((e) => e.exactInMerged).length / exerciseResults.length
            : null,
        mergedVsReferenceCER:
          page.verifiedSnippets[0]?.reviewStatus === 'reference'
            ? characterErrorRate(engines.merged, page.verifiedSnippets.map((s) => s.text).join('\n'))
            : null,
      },
    };

    const reportPath = join(outDir, `${page.id}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    summary.push({
      pageId: page.id,
      bookPage: page.bookPage,
      failures: failures.length,
      snippetHitRate: report.metrics.snippetHitRate,
      exerciseExactRate: report.metrics.exerciseExactRate,
      reportPath,
    });
    console.log(JSON.stringify(summary[summary.length - 1], null, 2));
  }

  const summaryPath = join(outDir, '_summary.json');
  writeFileSync(summaryPath, JSON.stringify({ generatedAt: new Date().toISOString(), pages: summary }, null, 2));
  console.log(`\nWrote ${summaryPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
