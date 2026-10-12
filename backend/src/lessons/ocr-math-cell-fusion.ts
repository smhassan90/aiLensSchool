import {
  type ExerciseCellLabel,
  type ExerciseCellReading,
  normalizeCellBody,
  pickBestCellCandidate,
  scoreCellExpression,
  storyContamination,
} from './ocr-exercise-grid-cells';
import type { CellOcrCandidate } from './ocr-math-cell-ocr';

export function normalizeMathCellOcrText(raw: string, label: ExerciseCellLabel): string {
  let t = normalizeCellBody(raw);
  t = t.replace(new RegExp(`^\\s*${label}\\s*\\.?\\s*`, 'i'), '').trim();
  if (t && !new RegExp(`^${label}\\s*\\.`, 'i').test(t)) {
    return `${label}. ${t}`;
  }
  return t.startsWith(`${label}.`) ? t : `${label}. ${t}`;
}

export function fuseCellOcrCandidates(
  label: ExerciseCellLabel,
  candidates: CellOcrCandidate[],
): ExerciseCellReading | null {
  const mapped = candidates
    .filter((c) => c.rawText.trim() && !storyContamination(c.rawText))
    .map((c) => ({
      source: c.engine,
      text: normalizeMathCellOcrText(c.rawText, label),
      variant: c.variant,
      score: scoreCellExpression(normalizeMathCellOcrText(c.rawText, label)),
    }));

  if (!mapped.length) return null;

  const bySource = mapped.map((m) => ({ source: m.source as ExerciseCellReading['source'], text: m.text }));
  const picked = pickBestCellCandidate(label, bySource);
  if (!picked) return null;

  let uncertain = picked.uncertain;
  const engines = new Set(mapped.map((m) => m.source));
  if (engines.size >= 2) {
    const bodies = mapped.map((m) => normalizeCellBody(m.text));
    const agree = bodies.filter((b, i) => bodies.findIndex((x) => x === b) === i).length === 1;
    if (!agree) uncertain = true;
  }

  return { ...picked, uncertain };
}
