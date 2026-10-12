/**
 * One-shot: derive p57 cell boxes from Paddle line geometry (orient 1400×1867).
 * Output: docs/ocr/ground_truth/p57-divide-grid-cell-calibration.json
 */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { prepareOrientedVariant } from '../src/lessons/page-image-prep';
import { runPaddleOcrOnBuffer } from '../src/lessons/paddle-ocr.runner';
import { imageDimensionsFromBuffer } from '../src/lessons/ocr-image-dimensions';
import { EXERCISE_CELL_LABELS, type ExerciseCellLabel } from '../src/lessons/ocr-exercise-grid-cells';
import type { OcrStructuredLine } from '../src/lessons/ocr-structured-line';
import type { PageCropBox } from '../src/lessons/ocr-region-image-prep';

const EXPECTED_SHA = '59172c0be72d8f78d8593bceb068cce4b9064a4f18750343a41a085020133dd1';
const IMAGE = join(process.cwd(), 'test-fixtures/fractions-chapter-calibration/p57-divide-grid.jpg');
const OUT = join(process.cwd(), '../docs/ocr/ground_truth/p57-divide-grid-cell-calibration.json');

function findLabelLine(lines: OcrStructuredLine[], label: ExerciseCellLabel): OcrStructuredLine | null {
  const re = new RegExp(`\\b${label}\\s*\\.`, 'i');
  return lines.find((l) => re.test(l.text)) ?? null;
}

function boxNorm(box: PageCropBox, w: number, h: number): [number, number, number, number] {
  return [box.x0 / w, box.y0 / h, box.x1 / w, box.y1 / h];
}

async function main() {
  const raw = readFileSync(IMAGE);
  const file = {
    buffer: raw,
    mimetype: 'image/jpeg',
    originalname: 'p57-divide-grid.jpg',
    size: raw.length,
  } as Express.Multer.File;
  const variant = await prepareOrientedVariant(file, 0);
  const buf = variant.ocr.buffer;
  const sha = createHash('sha256').update(buf).digest('hex');
  if (sha !== EXPECTED_SHA) {
    console.error('sha mismatch', sha);
    process.exit(3);
  }
  const dims = await imageDimensionsFromBuffer(buf);
  const pageW = dims.width;
  const pageH = dims.height;

  const paddle = await runPaddleOcrOnBuffer(
    { buffer: buf, mimetype: 'image/jpeg', originalname: 'orient.jpg' },
    { subjectName: 'Mathematics' },
  );
  const lines = [...(paddle.lines ?? [])].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);

  const labelLines: Partial<Record<ExerciseCellLabel, OcrStructuredLine>> = {};
  for (const label of EXERCISE_CELL_LABELS) {
    labelLines[label] = findLabelLine(lines, label) ?? undefined;
  }

  const found = EXERCISE_CELL_LABELS.filter((l) => labelLines[l]);
  console.log('labels found', found.length, found.join(','));

  const storyLine = lines.find((l) => /real[-\s]?life|story\s+sums/i.test(l.text));
  const divideLine = lines.find((l) => /divide/i.test(l.text) && /fraction/i.test(l.text));

  const xs = found.map((l) => labelLines[l]!.x0);
  const midX = pageW * 0.44;
  const colSplit =
    found.length >= 2
      ? (labelLines.b?.x0 ?? labelLines.d?.x0 ?? midX) - 8
      : midX;

  const gridY0 = divideLine ? divideLine.y1 + 8 : Math.min(...found.map((l) => labelLines[l]!.y0)) - 4;
  const gridY1 = storyLine ? storyLine.y0 - 10 : pageH * 0.4;

  const gridBox: PageCropBox = {
    x0: pageW * 0.04,
    y0: Math.max(divideLine?.y1 ?? 0, gridY0),
    x1: pageW * 0.72,
    y1: Math.min(pageH * 0.42, gridY1),
  };

  const cells: Array<{ label: ExerciseCellLabel; box: PageCropBox }> = [];
  for (let i = 0; i < EXERCISE_CELL_LABELS.length; i++) {
    const label = EXERCISE_CELL_LABELS[i];
    const line = labelLines[label];
    if (!line) continue;
    const col = i % 2;
    const nextLabel = EXERCISE_CELL_LABELS[i + 1];
    const nextLine = nextLabel ? labelLines[nextLabel] : null;
    let y1 = gridBox.y1;
    for (let j = i + 1; j < EXERCISE_CELL_LABELS.length; j++) {
      const nl = labelLines[EXERCISE_CELL_LABELS[j]];
      if (nl && nl.y0 > line.y0 + 8) {
        y1 = nl.y0 - 6;
        break;
      }
    }
    if (storyLine && storyLine.y0 < y1) y1 = Math.min(y1, storyLine.y0 - 8);
    const y0 = Math.max(gridBox.y0, line.y0 - 10);
    y1 = Math.max(y0 + 36, Math.min(pageH, y1));
    const x0 = col === 0 ? gridBox.x0 + 4 : colSplit + 12;
    const x1 = col === 0 ? colSplit - 4 : gridBox.x1 - 4;
    cells.push({ label, box: { x0, y0, x1, y1 } });
  }

  const doc = {
    testCaseId: 'p57-divide-grid',
    orientSha256: sha,
    pageWidth: pageW,
    pageHeight: pageH,
    coordinateSystem: 'orient_ocr_file_pixels_top_left',
    derivation: 'paddle_line_anchors_v1',
    headingLine: divideLine
      ? { y0: divideLine.y0, y1: divideLine.y1, text: divideLine.text.slice(0, 120) }
      : null,
    storyLine: storyLine
      ? { y0: storyLine.y0, y1: storyLine.y1, text: storyLine.text.slice(0, 120) }
      : null,
    gridBandNorm: boxNorm(gridBox, pageW, pageH),
    gridBandPx: gridBox,
    columnSplitX: colSplit,
    cells: cells.map((c) => ({
      label: c.label,
      boxNorm: boxNorm(c.box, pageW, pageH),
      boxPx: c.box,
      anchorLine: labelLines[c.label]
        ? {
            y0: labelLines[c.label]!.y0,
            y1: labelLines[c.label]!.y1,
            x0: labelLines[c.label]!.x0,
            x1: labelLines[c.label]!.x1,
            text: labelLines[c.label]!.text.slice(0, 100),
          }
        : null,
    })),
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(doc, null, 2));
  console.log('wrote', OUT, 'cells', cells.length);
  for (const t of ['a', 'b', 'e', 'n'] as const) {
    const c = cells.find((x) => x.label === t);
    console.log(t, c?.box);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
