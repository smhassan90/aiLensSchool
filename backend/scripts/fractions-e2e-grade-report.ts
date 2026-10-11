/**
 * Summarize e2e-portal-reports into PASS / PARTIAL / FAIL (heuristic + snippet checks).
 * Usage: npx tsx scripts/fractions-e2e-grade-report.ts
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { snippetFoundInTranscript } from '../src/lessons/ocr-calibration-metrics';
import { transcriptNoiseScore } from '../src/lessons/ocr-layout-reconcile-utils';

type Grade = 'PASS' | 'PARTIAL' | 'FAIL';

function gradePage(report: {
  pageId: string;
  bookPage: number | null;
  finalOcrText: string;
  paddle: string;
  tesseract: string;
  legacyMerged: string;
  usedLayoutReconcile: boolean;
  signals: { introDuplicateCount: number; gluedAdditionSubtraction: boolean };
}): { grade: Grade; reasons: string[] } {
  const t = report.finalOcrText ?? '';
  const reasons: string[] = [];
  let fail = 0;
  let partial = 0;

  if (!t.trim()) {
    return { grade: 'FAIL', reasons: ['empty final transcript'] };
  }
  if (report.signals.introDuplicateCount > 1) {
    fail += 1;
    reasons.push('duplicate intro sentences');
  }
  if (report.signals.gluedAdditionSubtraction) {
    partial += 1;
    reasons.push('glued additionsubtraction token');
  }
  if (transcriptNoiseScore(t) > 40) {
    fail += 1;
    reasons.push('high column-bleed / pipe noise');
  }
  if (/\b402\s+40\/202\b/.test(t)) {
    fail += 1;
    reasons.push('digit-soup fraction fragment');
  }
  if (report.pageId === 'p39-reduce') {
    if (!snippetFoundInTranscript('addition', t) || !snippetFoundInTranscript('subtraction', t)) {
      partial += 1;
      reasons.push('missing addition/subtraction intro wording');
    }
    if (!snippetFoundInTranscript('28', t) || !snippetFoundInTranscript('40', t)) {
      partial += 1;
      reasons.push('missing example fraction digits');
    }
    if (!snippetFoundInTranscript('7', t) || !snippetFoundInTranscript('10', t)) {
      partial += 1;
      reasons.push('missing reduced fraction 7/10 digits');
    }
    if (!/REMEMBER/i.test(t) && !/denominators same/i.test(t)) {
      partial += 1;
      reasons.push('REMEMBER sidebar cues weak');
    }
    if (!/\b28\s*\/\s*40\b/.test(t) && !/28.*40/.test(t)) {
      fail += 1;
      reasons.push('no faithful 28/40 fraction relationship');
    }
  }
  if (report.pageId === 'p57-divide-grid') {
    if (!/÷/.test(t) && !/\//.test(t)) {
      fail += 1;
      reasons.push('grid divide page missing ÷ or /');
    }
    if (!snippetFoundInTranscript('1 2/5', t)) {
      fail += 1;
      reasons.push('exercise a mixed number missing');
    }
  }

  if (fail > 0) return { grade: 'FAIL', reasons };
  if (partial > 0) return { grade: 'PARTIAL', reasons };
  return { grade: 'PASS', reasons: ['heuristic checks ok'] };
}

function main() {
  const dir = join(process.cwd(), 'test-fixtures', 'fractions-chapter-calibration', 'e2e-portal-reports');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== '_summary.json');
  const rows: Array<Record<string, unknown>> = [];
  const counts = { PASS: 0, PARTIAL: 0, FAIL: 0 };

  for (const f of files.sort()) {
    const report = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
    const { grade, reasons } = gradePage(report);
    counts[grade] += 1;
    rows.push({
      page: report.bookPage ?? report.pageId,
      pageId: report.pageId,
      grade,
      usedLayoutReconcile: report.usedLayoutReconcile,
      introDupes: report.signals?.introDuplicateCount,
      noise: transcriptNoiseScore(report.finalOcrText),
      finalLen: report.finalOcrText?.length,
      reasons,
    });
  }

  const md = [
    '# Fractions chapter E2E quality (portal path)',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `**Totals:** ${files.length} pages — PASS ${counts.PASS}, PARTIAL ${counts.PARTIAL}, FAIL ${counts.FAIL}`,
    '',
    '| Page | Grade | Layout | Intro dupes | Noise | Notes |',
    '|------|-------|--------|-------------|-------|-------|',
    ...rows.map((r) =>
      `| ${r.page} | ${r.grade} | ${r.usedLayoutReconcile} | ${r.introDupes} | ${r.noise} | ${(r.reasons as string[]).join('; ')} |`,
    ),
  ].join('\n');

  const out = join(dir, 'QUALITY_REPORT.md');
  writeFileSync(out, md);
  writeFileSync(join(dir, '_grades.json'), JSON.stringify({ counts, rows }, null, 2));
  console.log(md);
  console.log(`\nWrote ${out}`);
}

main();
