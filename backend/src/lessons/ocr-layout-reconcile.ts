import { isMathScienceSubjectName } from '../common/math-lesson-text';
import { isEnglishPrimarySubject } from './ocr-subject-lang';
import {
  isOxfordFractionsWorkbookPage,
  mergeOxfordFractionsWorkbookPageOcr,
} from './ocr-fractions-workbook';
import { mergePaddleAndTesseractPageOcr, ocrLinesDuplicate } from './merge-paddle-tesseract-ocr';
import { cleanMergedPageOcrText, repairWorkbookFractionIntroGluedOps } from './science-ocr-clean';
import { stripInterleavedWeblinkSidebar } from './sidebar-layout-ocr';
import { transcriptNoiseScore, wordOverlapRatio } from './ocr-layout-reconcile-utils';
import type {
  OcrStructuredLine,
  PageOcrReconcileResult,
  PageOcrStructuredInput,
} from './ocr-structured-line';

const PIPELINE_VERSION = 'layout-reconcile-v1';

const SIDEBAR_CUE = /^(?:REMEMBER|IMPORTANT!?|KEY\s+VOCABULARY|NOTE\s+FOR)/i;
const MATH_SECTION_CUE =
  /\b(?:Solution|Examples?|Reduce\b|Therefore|Hence|Exercise\b|÷|×|\d+\s*\/\s*\d+)/i;

function normalizeIntroKey(line: string): string {
  return line
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const INTRO_OPENING = /^now we will deal with/i;

function introLinesLikelySameSentence(a: string, b: string): boolean {
  if (!INTRO_OPENING.test(a.trim()) || !INTRO_OPENING.test(b.trim())) return false;
  const ka = normalizeIntroKey(a);
  const kb = normalizeIntroKey(b);
  const prefixLen = Math.min(ka.length, kb.length, 40);
  if (prefixLen < 22) return false;
  let same = 0;
  for (let i = 0; i < prefixLen; i += 1) {
    if (ka[i] === kb[i]) same += 1;
    else break;
  }
  if (same >= 22) return true;
  return wordOverlapRatio(a, b) >= 0.55;
}

function lineReadabilityScore(s: string): number {
  return (
    s.length +
    (s.match(/,/g) ?? []).length * 3 +
    (s.match(/\baddition\b/i) ? 2 : 0) +
    (s.match(/\bsubtraction\b/i) ? 2 : 0) +
    (s.match(/\bmultiplication\b/i) ? 2 : 0) -
    (/\badditionsubtraction/i.test(s) ? 8 : 0) -
    (/\badditionsubtractionmultiplication/i.test(s) ? 10 : 0)
  );
}

/** Drop repeated opening sentences (Paddle + Tess variants of the same intro). */
export function dedupeNearDuplicateLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }
    let skip = false;
    for (const prev of out) {
      if (!prev.trim()) continue;
      if (ocrLinesDuplicate(line, prev)) {
        skip = true;
        break;
      }
      const sameIntro = introLinesLikelySameSentence(line, prev);
      const keyA = normalizeIntroKey(line);
      const keyB = normalizeIntroKey(prev);
      const nearDup =
        sameIntro ||
        (keyA.length >= 24 &&
          keyB.length >= 24 &&
          (keyA.includes(keyB.slice(0, 20)) || keyB.includes(keyA.slice(0, 20))) &&
          wordOverlapRatio(line, prev) >= 0.72);
      if (nearDup) {
        if (lineReadabilityScore(line) <= lineReadabilityScore(prev)) {
          skip = true;
          break;
        }
        const idx = out.indexOf(prev);
        if (idx >= 0) out.splice(idx, 1);
        break;
      }
    }
    if (!skip) out.push(line);
  }
  return out.map((line) => splitInlineIntroClauses(line));
}

/** Paddle sometimes emits two intro clauses on one physical line. */
function splitInlineIntroClauses(line: string): string {
  const repaired = repairWorkbookFractionIntroGluedOps(line);
  if (!/Now we will deal with/i.test(repaired)) return repaired;
  const parts = repaired
    .split(/\s+(?=Now we will deal with)/i)
    .map((p) => repairWorkbookFractionIntroGluedOps(p.trim()))
    .filter(Boolean);
  if (parts.length < 2) return repaired;
  return dedupeNearDuplicateLines(parts).join(' ');
}

function lineCenterY(line: OcrStructuredLine): number {
  return (line.y0 + line.y1) / 2;
}

function assignReadingOrder(lines: OcrStructuredLine[]): OcrStructuredLine[] {
  const sorted = [...lines].sort((a, b) => {
    const dy = lineCenterY(a) - lineCenterY(b);
    if (Math.abs(dy) > 14) return dy;
    return a.x0 - b.x0;
  });
  return sorted.map((l, i) => ({ ...l, readingOrder: i }));
}

function clusterLinesByBand(
  lines: OcrStructuredLine[],
  yTol = 48,
): OcrStructuredLine[][] {
  const sorted = assignReadingOrder(lines);
  const bands: OcrStructuredLine[][] = [];
  for (const line of sorted) {
    const cy = lineCenterY(line);
    let band = bands.find((b) => Math.abs(lineCenterY(b[0]) - cy) <= yTol);
    if (!band) {
      band = [];
      bands.push(band);
    }
    band.push(line);
  }
  bands.sort((a, b) => lineCenterY(a[0]) - lineCenterY(b[0]));
  return bands;
}

function pickBetterLine(a: OcrStructuredLine, b: OcrStructuredLine): OcrStructuredLine {
  const ta = a.text.trim();
  const tb = b.text.trim();
  if (!ta) return b;
  if (!tb) return a;
  if (ocrLinesDuplicate(ta, tb)) {
    const score = (s: string, conf?: number) =>
      s.length + (conf ?? 0.5) * 20 + (s.includes(',') ? 4 : 0);
    return score(ta, a.confidence) >= score(tb, b.confidence) ? a : b;
  }
  const confA = a.confidence ?? 0.5;
  const confB = b.confidence ?? 0.5;
  if (confB > confA + 0.15 && tb.length >= ta.length * 0.85) return b;
  if (confA > confB + 0.15 && ta.length >= tb.length * 0.85) return a;
  return ta.length >= tb.length ? a : b;
}

function matchLinesAcrossEngines(
  paddleLines: OcrStructuredLine[],
  tessLines: OcrStructuredLine[],
): OcrStructuredLine[] {
  const usedT = new Set<number>();
  const merged: OcrStructuredLine[] = [];

  for (const pl of assignReadingOrder(paddleLines)) {
    let bestIdx = -1;
    let bestScore = 0;
    const pcY = lineCenterY(pl);
    for (let i = 0; i < tessLines.length; i += 1) {
      if (usedT.has(i)) continue;
      const tl = tessLines[i];
      if (Math.abs(lineCenterY(tl) - pcY) > 55) continue;
      const overlap = wordOverlapRatio(pl.text, tl.text);
      if (overlap > bestScore) {
        bestScore = overlap;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestScore >= 0.45) {
      usedT.add(bestIdx);
      const chosen = pickBetterLine(pl, tessLines[bestIdx]);
      merged.push(chosen);
    } else {
      merged.push(pl);
    }
  }

  for (let i = 0; i < tessLines.length; i += 1) {
    if (usedT.has(i)) continue;
    const tl = tessLines[i];
    if (!tl.text.trim()) continue;
    const cy = lineCenterY(tl);
    const duplicate = merged.some(
      (m) => Math.abs(lineCenterY(m) - cy) <= 40 && wordOverlapRatio(m.text, tl.text) >= 0.55,
    );
    if (!duplicate) merged.push(tl);
  }

  return assignReadingOrder(merged);
}

function structuredLinesToTranscript(lines: OcrStructuredLine[]): string {
  const bands = clusterLinesByBand(lines);
  const sidebar: string[] = [];
  const body: string[] = [];

  for (const band of bands) {
    const text = band
      .sort((a, b) => a.x0 - b.x0)
      .map((l) => l.text.trim())
      .filter(Boolean)
      .join(' ')
      .trim();
    if (!text) continue;
    if (SIDEBAR_CUE.test(text) || (text.length < 80 && SIDEBAR_CUE.test(band[0]?.text ?? ''))) {
      sidebar.push(text);
    } else if (MATH_SECTION_CUE.test(text) || band.some((l) => MATH_SECTION_CUE.test(l.text))) {
      body.push(text);
    } else {
      body.push(text);
    }
  }

  const ordered = [...body, ...sidebar];
  return dedupeNearDuplicateLines(ordered).join('\n').trim();
}

function hasUsableStructure(input: PageOcrStructuredInput): boolean {
  const p = input.paddleLines?.filter((l) => l.text.trim()) ?? [];
  const t = input.tesseractLines?.filter((l) => l.text.trim()) ?? [];
  return p.length >= 3 || t.length >= 3;
}

/**
 * Layout-aware reconciliation with fallback to legacy string merge.
 */
export function reconcilePageOcr(input: PageOcrStructuredInput): PageOcrReconcileResult {
  const warnings: string[] = [];
  const workbook =
    isMathScienceSubjectName(input.subjectName) &&
    isOxfordFractionsWorkbookPage(`${input.paddle}\n${input.tesseract}`);
  const legacy = workbook
    ? mergeOxfordFractionsWorkbookPageOcr(input.paddle, input.tesseract)
    : cleanMergedPageOcrText(
        stripInterleavedWeblinkSidebar(
          mergePaddleAndTesseractPageOcr(input.paddle, input.tesseract),
        ),
      );

  if (workbook) {
    const flat = dedupeNearDuplicateLines(legacy.split(/\r?\n/))
      .map((l) => splitInlineIntroClauses(l))
      .join('\n')
      .trim();
    return {
      plainText: cleanMergedPageOcrText(stripInterleavedWeblinkSidebar(flat)),
      usedLayoutReconcile: false,
      warnings: ['fractions_workbook_string_merge_only'],
    };
  }

  if (!hasUsableStructure(input)) {
    const flat = dedupeNearDuplicateLines(legacy.split(/\r?\n/))
      .map((l) => splitInlineIntroClauses(l))
      .join('\n')
      .trim();
    return {
      plainText: cleanMergedPageOcrText(stripInterleavedWeblinkSidebar(flat)),
      usedLayoutReconcile: false,
      warnings: ['structured_lines_unavailable'],
    };
  }

  const paddleLines =
    input.paddleLines?.map((l) => ({ ...l, engine: 'paddle' as const })) ?? [];
  const tessLines =
    input.tesseractLines?.map((l) => ({ ...l, engine: 'tesseract' as const })) ?? [];

  const paired = matchLinesAcrossEngines(paddleLines, tessLines);
  let structuredText = structuredLinesToTranscript(paired);

  const englishPrimary = isEnglishPrimarySubject(input.subjectName);
  if (!englishPrimary) {
    warnings.push('rtl_subject_using_structured_order');
  }

  structuredText = cleanMergedPageOcrText(stripInterleavedWeblinkSidebar(structuredText));

  if (!structuredText.trim()) {
    return { plainText: legacy, usedLayoutReconcile: false, warnings: ['structured_empty'] };
  }

  const legacyDeduped = dedupeNearDuplicateLines(legacy.split(/\r?\n/))
    .map((l) => splitInlineIntroClauses(l))
    .join('\n')
    .trim();
  const legacyDedupedClean = cleanMergedPageOcrText(stripInterleavedWeblinkSidebar(legacyDeduped));

  // Never ship clearly worse duplicate intros than legacy merge fixed.
  const structDupes = (structuredText.match(/\bNow we will deal with/gi) ?? []).length;
  const legacyDupes = (legacyDedupedClean.match(/\bNow we will deal with/gi) ?? []).length;
  const structNoise = transcriptNoiseScore(structuredText);
  const legacyNoise = transcriptNoiseScore(legacyDedupedClean);
  if (structDupes > legacyDupes) {
    warnings.push('structured_more_duplicate_intros');
    return { plainText: legacyDedupedClean, usedLayoutReconcile: false, warnings };
  }
  if (structNoise > legacyNoise + 6 && structNoise >= legacyNoise * 1.35) {
    warnings.push('structured_noisier_than_legacy');
    return { plainText: legacyDedupedClean, usedLayoutReconcile: false, warnings };
  }

  const legacyLineCount = legacyDedupedClean.split(/\r?\n/).filter((l) => l.trim()).length;
  const structLineCount = structuredText.split(/\r?\n/).filter((l) => l.trim()).length;
  if (legacyLineCount >= 8 && structLineCount < legacyLineCount * 0.45) {
    warnings.push('structured_collapsed_reading_order');
    return { plainText: legacyDedupedClean, usedLayoutReconcile: false, warnings };
  }

  return {
    plainText: structuredText,
    usedLayoutReconcile: true,
    warnings,
  };
}

export function mergePageOcr(input: PageOcrStructuredInput): string {
  return reconcilePageOcr({ ...input, pipelineVersion: PIPELINE_VERSION }).plainText;
}
