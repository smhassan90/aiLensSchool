import { normalizePix2TextPlain, pix2textPlainForFusion } from './ocr-pix2text-latex-plain';
import type { OcrStructuredLine } from './ocr-structured-line';
import type { PageCropBox } from './ocr-region-image-prep';
import { scoreFractionOcrText } from './ocr-math-region-recovery';

export type ExerciseCellLabel =
  | 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'k' | 'l' | 'm' | 'n';

export const EXERCISE_CELL_LABELS: ExerciseCellLabel[] = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n',
];

export type ExerciseCellReading = {
  label: ExerciseCellLabel;
  text: string;
  source: 'paddle' | 'tesseract' | 'pix2text' | 'pix2text_grid_parse' | 'merged';
  score: number;
  uncertain: boolean;
};

const STORY_RE =
  /\breal[-\s]?life\b|\bstory\s+sums?\b|\bchildren\s+ate\b|\bice\s*cream\b|\bmaham\b|\bchocolates?\b|\bribbon\b|\bcupcake\b|\btextbooks?\b/i;

const LABEL_START = /\b([a-n])\s*\.(?:\s|$)/i;

export function storyContamination(text: string): boolean {
  return STORY_RE.test(text || '');
}

export function normalizeCellBody(text: string): string {
  return normalizePix2TextPlain(text).replace(/\s+/g, ' ').trim();
}

/** Split Pix2Text / plain grid blob into per-label bodies (visible cells only). */
export function parseCellsFromGridPlain(plain: string): Partial<Record<ExerciseCellLabel, string>> {
  const t = pix2textPlainForFusion(plain);
  const cut = t.split(/\breal[-\s]?life\b/i)[0] ?? t;
  const out: Partial<Record<ExerciseCellLabel, string>> = {};
  const re = /\b([a-n])\s*\.?\s*/gi;
  const hits: Array<{ label: ExerciseCellLabel; index: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(cut)) !== null) {
    const label = m[1].toLowerCase() as ExerciseCellLabel;
    if (!EXERCISE_CELL_LABELS.includes(label)) continue;
    hits.push({ label, index: m.index, end: m.index + m[0].length });
  }
  hits.sort((a, b) => a.index - b.index);
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].end;
    const end = i + 1 < hits.length ? hits[i + 1].index : cut.length;
    const body = cut.slice(start, end).trim();
    if (body && !storyContamination(body)) {
      out[hits[i].label] = body;
    }
  }
  return out;
}

export function scoreCellExpression(text: string): number {
  const t = normalizeCellBody(text);
  if (!t) return -20;
  if (storyContamination(t)) return -50;
  let s = scoreFractionOcrText(t);
  if (/\d\s*\/\s*\d/.test(t)) s += 4;
  if (/÷/.test(t)) s += 3;
  if (!/÷/.test(t) && /\b21\s*\/\s*21\b|\b66\s*\/\s*6\b/.test(t)) s -= 12;
  if (/\d{7,}/.test(t.replace(/\s/g, ''))) s -= 15;
  if (t.length > 120) s -= 8;
  return s;
}

export function pickBestCellCandidate(
  label: ExerciseCellLabel,
  candidates: Array<{ source: ExerciseCellReading['source']; text: string }>,
): ExerciseCellReading | null {
  const viable = candidates
    .map((c) => {
      const body = normalizeCellBody(c.text);
      const prefixed = body.match(LABEL_START)
        ? body
        : body
          ? `${label}. ${body}`
          : '';
      let score = scoreCellExpression(prefixed);
      if (c.source === 'pix2text' || c.source === 'pix2text_grid_parse') {
        if (/÷/.test(prefixed) && /\d\s*\/\s*\d/.test(prefixed)) score += 5;
      }
      return { label, text: prefixed, source: c.source, score, uncertain: false };
    })
    .filter((c) => c.text && c.score > -10);

  if (!viable.length) return null;
  viable.sort((a, b) => b.score - a.score);
  const best = viable[0];
  const second = viable[1];
  const uncertain = Boolean(second && second.score >= best.score - 1 && best.score < 8);
  return { ...best, uncertain };
}

/** Group OCR lines into rough per-label snippets inside the grid box. */
export function cellTextFromStructuredLines(
  label: ExerciseCellLabel,
  lines: OcrStructuredLine[],
  gridBox: PageCropBox,
): string {
  const inGrid = lines
    .filter((l) => {
      const cy = (l.y0 + l.y1) / 2;
      return cy >= gridBox.y0 && cy <= gridBox.y1;
    })
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);

  const labelLineIdx = inGrid.findIndex((l) =>
    new RegExp(`\\b${label}\\s*\\.`, 'i').test(l.text),
  );
  if (labelLineIdx < 0) return '';

  const labelOrder = EXERCISE_CELL_LABELS;
  const labelIdx = labelOrder.indexOf(label);
  let endY = gridBox.y1;
  for (let j = labelLineIdx + 1; j < inGrid.length; j++) {
    const t = inGrid[j].text;
    for (let k = labelIdx + 1; k < labelOrder.length; k++) {
      if (new RegExp(`\\b${labelOrder[k]}\\s*\\.`, 'i').test(t)) {
        endY = inGrid[j].y0;
        break;
      }
    }
    if (endY < gridBox.y1) break;
  }

  const slice = inGrid.filter((l) => l.y0 >= inGrid[labelLineIdx].y0 - 2 && l.y0 < endY);
  return slice.map((l) => l.text.trim()).join(' ');
}

export function labelOrderValid(labels: ExerciseCellLabel[]): boolean {
  if (labels.length < 2) return labels.length === 1;
  const ord = (l: ExerciseCellLabel) => EXERCISE_CELL_LABELS.indexOf(l);
  for (let i = 1; i < labels.length; i++) {
    if (ord(labels[i]) <= ord(labels[i - 1])) return false;
  }
  return true;
}

export function duplicateLabels(labels: ExerciseCellLabel[]): boolean {
  return new Set(labels).size !== labels.length;
}

export function formatExerciseGridBlock(
  headingLine: string,
  cells: ExerciseCellReading[],
): string {
  const lines = [headingLine.trim()];
  for (const c of cells) {
    const body = c.text.replace(new RegExp(`^\\s*${c.label}\\s*\\.\\s*`, 'i'), '').trim();
    lines.push(`${c.label}. ${body}`.trim());
  }
  return lines.join('\n');
}
