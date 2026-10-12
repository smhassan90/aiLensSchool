import type { OcrStructuredLine } from './ocr-structured-line';
import type { PageCropBox } from './ocr-region-image-prep';

/** Calibration default for Oxford 4×4 divide grid (p57 orient 1400×1867). */
export const DIVIDE_GRID_CALIBRATION_BOX = [0.04, 0.098, 0.72, 0.288] as const;

const STORY_LINE =
  /\breal[-\s]?life\b|\bstory\s+sums?\b|\bchildren\s+ate\b|\bmaham\b|\bchocolates?\b|\bribbon\b|\bcupcake\b/i;

const DIVIDE_HEADING = /\bdivide\b[\s\S]{0,48}\bfractions?\b/i;

export function fractionBoxFromNormalized(
  box: readonly [number, number, number, number],
  pageW: number,
  pageH: number,
): PageCropBox {
  const [x0f, y0f, x1f, y1f] = box;
  return {
    x0: x0f * pageW,
    y0: y0f * pageH,
    x1: x1f * pageW,
    y1: y1f * pageH,
  };
}

function lineInBox(line: OcrStructuredLine, box: PageCropBox, pad = 6): boolean {
  const cy = (line.y0 + line.y1) / 2;
  const cx = (line.x0 + line.x1) / 2;
  return (
    cy >= box.y0 - pad &&
    cy <= box.y1 + pad &&
    cx >= box.x0 - pad &&
    cx <= box.x1 + pad
  );
}

/**
 * Tight crop: calibration box intersected with heading bottom and story top from OCR lines.
 */
export function preciseDivideExerciseGridCrop(input: {
  pageWidth: number;
  pageHeight: number;
  paddleLines?: OcrStructuredLine[];
  tesseractLines?: OcrStructuredLine[];
  transcript?: string | null;
  calibrationBox?: readonly [number, number, number, number];
}): PageCropBox | null {
  const pageW = Math.max(1, input.pageWidth);
  const pageH = Math.max(1, input.pageHeight);
  const cal = input.calibrationBox ?? DIVIDE_GRID_CALIBRATION_BOX;
  let box = fractionBoxFromNormalized(cal, pageW, pageH);

  const lines = [...(input.paddleLines ?? []), ...(input.tesseractLines ?? [])].filter(
    (l) => l.text.trim(),
  );
  let heading = lines.find((l) => DIVIDE_HEADING.test(l.text));
  if (!heading) {
    const t = (input.transcript ?? '').trim();
    const headLine = t.split(/\r?\n/).find((l) => DIVIDE_HEADING.test(l));
    if (!headLine) return null;
    heading = {
      text: headLine,
      x0: box.x0,
      y0: box.y0 - 24,
      x1: box.x1,
      y1: box.y0 - 4,
      engine: 'paddle',
    };
  }

  const headingBottom = heading.y1 + 2;
  if (headingBottom > box.y0) {
    box = { ...box, y0: Math.min(box.y1 - 40, headingBottom) };
  }

  const minGridBandPx = Math.max(48, pageH * 0.28);
  const storyCandidates = lines
    .filter((l) => l.y0 >= box.y0 + 80)
    .sort((a, b) => a.y0 - b.y0)
    .filter((l) => STORY_LINE.test(l.text));
  const storyLine = storyCandidates[0];
  if (storyLine) {
    const candidateY1 = Math.max(box.y0 + 40, storyLine.y0 - 12);
    if (candidateY1 - box.y0 >= minGridBandPx) {
      box = { ...box, y1: candidateY1 };
    }
  }

  if (box.y1 - box.y0 < 48 || box.x1 - box.x0 < 80) return null;
  return box;
}

export function hasDivideExerciseGridHeading(
  lines: OcrStructuredLine[],
  transcript?: string | null,
): boolean {
  if (lines.some((l) => DIVIDE_HEADING.test(l.text))) return true;
  const t = (transcript ?? '').trim();
  if (!t) return false;
  if (DIVIDE_HEADING.test(t)) return true;
  const head = t.split(/\r?\n/).slice(0, 6).join(' ');
  return DIVIDE_HEADING.test(head);
}

export function linesInsideGridBox(
  lines: OcrStructuredLine[],
  box: PageCropBox,
): OcrStructuredLine[] {
  return lines.filter((l) => lineInBox(l, box));
}
