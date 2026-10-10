import * as fs from 'fs';
import * as path from 'path';

export type OcrExamplePackMeta = {
  id: string;
  subject: string;
  scienceFewShot?: boolean;
  mustMatch: string[];
  mustNotMatch?: string[];
};

export type OcrExamplePack = {
  dir: string;
  meta: OcrExamplePackMeta;
  paddle: string;
  tesseract: string;
  expected: string;
  notes: string;
};

/** Resolve test-fixtures/ocr-examples whether cwd is repo root or backend/. */
export function resolveOcrExamplesRoot(): string {
  const candidates = [
    path.join(process.cwd(), 'test-fixtures', 'ocr-examples'),
    path.join(process.cwd(), 'backend', 'test-fixtures', 'ocr-examples'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[0];
}

function readOptional(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
}

export function loadOcrExamplePack(packDir: string): OcrExamplePack | null {
  const metaPath = path.join(packDir, 'meta.json');
  if (!fs.existsSync(metaPath)) return null;
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as OcrExamplePackMeta;
  if (!meta?.id || !Array.isArray(meta.mustMatch)) return null;
  return {
    dir: packDir,
    meta,
    paddle: readOptional(path.join(packDir, 'raw-paddle.txt')),
    tesseract: readOptional(path.join(packDir, 'raw-tesseract.txt')),
    expected: readOptional(path.join(packDir, 'expected.txt')),
    notes: readOptional(path.join(packDir, 'notes.md')),
  };
}

export function loadAllOcrExamplePacks(root = resolveOcrExamplesRoot()): OcrExamplePack[] {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => loadOcrExamplePack(path.join(root, d.name)))
    .filter((p): p is OcrExamplePack => Boolean(p));
}

/** Inlined when Docker/runtime has no test-fixtures on disk. */
const EMBEDDED_SCIENCE_FEW_SHOTS = `Science/numericals OCR repair examples (imitate cleanup style; do not invent numbers):
--- Example physics-numericals-section-c (messy) ---
Ya What is the wavelength ... frequency of 1300 1300 1300 57% SRR 5
Where 1K the 103, and the speed of the radio-wave is 3x10" ms. (230.76m)
(1.28ms™)
--- Example physics-numericals-section-c (cleaned) ---
What is the wavelength ... frequency of 1300 kHz?
Where 1K = 10^3, and the speed of the radio-wave is 3 × 10^8 ms^-1. (230.76m)
(1.28ms^-1)
--- Example physics-weblinks-waves (messy) ---
Encourage students to visit below link for Waves Ripple
https://www.youtube.com/ watch?v=... Result=1.0m/s
--- Example physics-weblinks-waves (cleaned) ---
Step 2 / Step 3 body kept. Result = 1.0 m/s. No YouTube / Encourage students lines.`;

/**
 * Short before/after snippets for science AI merge prompts.
 * Keeps English Dignity grounding separate — only scienceFewShot packs.
 */
export function buildScienceOcrFewShotBlock(
  packs = loadAllOcrExamplePacks(),
  maxPacks = 2,
): string {
  const science = packs.filter((p) => p.meta.scienceFewShot);
  if (!science.length) return EMBEDDED_SCIENCE_FEW_SHOTS;

  const chunks: string[] = [
    'Science/numericals OCR repair examples (imitate cleanup style; do not invent numbers):',
  ];
  for (const pack of science.slice(0, maxPacks)) {
    const messy = (pack.paddle || pack.tesseract).slice(0, 420);
    const clean = (pack.expected || pack.tesseract).slice(0, 420);
    if (!messy.trim() || !clean.trim()) continue;
    chunks.push(`--- Example ${pack.meta.id} (messy) ---`);
    chunks.push(messy.trim());
    chunks.push(`--- Example ${pack.meta.id} (cleaned) ---`);
    chunks.push(clean.trim());
  }
  return chunks.length > 1 ? chunks.join('\n') : EMBEDDED_SCIENCE_FEW_SHOTS;
}

export function textLooksLikeScienceForFewShot(text: string): boolean {
  const value = (text ?? '').trim();
  if (!value) return false;
  return /\b(?:numericals?|wavelength|frequency|amplitude|slinky|pendulum|ripple\s*tank|section\s*\(\s*[a-c]\s*\)|ms\^-?1|kHz|weblinks?)\b/i.test(
    value,
  );
}
