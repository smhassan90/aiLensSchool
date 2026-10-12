/**
 * Compare two OCR diagnostic manifest.json files stage-by-stage.
 *
 * Usage:
 *   npx tsx scripts/compare-ocr-manifests.ts <prodManifest.json> <localManifest.json>
 */
import { readFileSync, existsSync } from 'fs';

type Manifest = {
  correlationId: string;
  testCaseId?: string;
  images?: Array<{ stage: string; sha256: string; width?: number; height?: number }>;
  texts?: Array<{ stage: string; sha256: string; charCount: number }>;
  events?: Array<{
    stage: string;
    engine?: string;
    fusionDecision?: string;
    extra?: Record<string, unknown>;
    elapsedMs?: number;
  }>;
  featureFlags?: { flags?: Record<string, { effective?: unknown }> };
};

function load(path: string): Manifest {
  const raw = readFileSync(path, 'utf-8').replace(/^\uFEFF/, '');
  return JSON.parse(raw) as Manifest;
}

function byStageImages(m: Manifest): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of m.images ?? []) {
    map.set(row.stage, row.sha256);
  }
  return map;
}

function byStageTexts(m: Manifest): Map<string, { sha256: string; charCount: number }> {
  const map = new Map<string, { sha256: string; charCount: number }>();
  for (const row of m.texts ?? []) {
    map.set(row.stage, { sha256: row.sha256, charCount: row.charCount });
  }
  return map;
}

function main() {
  const aPath = process.argv[2];
  const bPath = process.argv[3];
  if (!aPath || !bPath || !existsSync(aPath) || !existsSync(bPath)) {
    console.error('Usage: tsx compare-ocr-manifests.ts <manifestA> <manifestB>');
    process.exit(2);
  }
  const a = load(aPath);
  const b = load(bPath);
  const imgA = byStageImages(a);
  const imgB = byStageImages(b);
  const txtA = byStageTexts(a);
  const txtB = byStageTexts(b);

  const stages = new Set([...imgA.keys(), ...imgB.keys(), ...txtA.keys(), ...txtB.keys()]);
  const rows: Array<{
    stage: string;
    imageMatch: string;
    textMatch: string;
    prodChars?: number;
    localChars?: number;
  }> = [];

  let firstDivergence: string | null = null;
  for (const stage of [...stages].sort()) {
    const iA = imgA.get(stage);
    const iB = imgB.get(stage);
    let imageMatch = 'n/a';
    if (iA || iB) {
      imageMatch = iA && iB && iA === iB ? 'match' : 'mismatch';
      if (imageMatch === 'mismatch' && !firstDivergence) firstDivergence = `image:${stage}`;
    }
    const tA = txtA.get(stage);
    const tB = txtB.get(stage);
    let textMatch = 'n/a';
    if (tA || tB) {
      textMatch = tA && tB && tA.sha256 === tB.sha256 ? 'match' : 'mismatch';
      if (textMatch === 'mismatch' && !firstDivergence) firstDivergence = `text:${stage}`;
    }
    rows.push({
      stage,
      imageMatch,
      textMatch,
      prodChars: tA?.charCount,
      localChars: tB?.charCount,
    });
  }

  function pix2Timings(m: Manifest) {
    const close = (m.events ?? []).find((e) => e.stage === 'pix2text_worker_close');
    const parsed = (m.events ?? []).find((e) => e.stage === 'pix2text_worker_parsed');
    return {
      workerWallMs: close?.extra?.workerWallMs,
      loadMs: parsed?.extra?.loadMs,
      stdoutChars: close?.extra?.stdoutChars ?? close?.extra?.stdoutChars,
      version: parsed?.extra?.version,
    };
  }

  const report = {
    manifestA: aPath,
    manifestB: bPath,
    testCaseA: a.testCaseId,
    testCaseB: b.testCaseId,
    firstDivergence,
    pix2textTimingsA: pix2Timings(a),
    pix2textTimingsB: pix2Timings(b),
    featureFlagsA: a.featureFlags?.flags?.OCR_PIX2TEXT_MATH_CROPS?.effective,
    featureFlagsB: b.featureFlags?.flags?.OCR_PIX2TEXT_MATH_CROPS?.effective,
    rows,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(firstDivergence ? 1 : 0);
}

main();
