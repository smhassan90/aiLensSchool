import {
  geometricDivideGridCells,
  detectDivideExerciseGridLayout,
} from './ocr-math-cell-layout';
import { DIVIDE_GRID_CALIBRATION_BOX, fractionBoxFromNormalized } from './ocr-exercise-grid-crop';
import { EXERCISE_CELL_LABELS, exerciseCellGridPosition } from './ocr-exercise-grid-cells';

describe('ocr-math-cell-layout', () => {
  it('geometricDivideGridCells yields 14 labeled regions', () => {
    const box = fractionBoxFromNormalized(DIVIDE_GRID_CALIBRATION_BOX, 1400, 1867);
    const cells = geometricDivideGridCells(box);
    expect(cells).toHaveLength(14);
    expect(cells[0].label).toBe('a');
    expect(cells[13].label).toBe('n');
  });

  it('detectDivideExerciseGridLayout requires divide heading', async () => {
    const buf = Buffer.alloc(100);
    const layout = await detectDivideExerciseGridLayout({
      imageBuffer: buf,
      pageWidth: 1400,
      pageHeight: 1867,
      transcript: '7. Divide the following fractions',
      paddleLines: [],
      tesseractLines: [],
    });
    expect(layout).not.toBeNull();
    expect(layout!.pageWidth).toBe(1400);
    expect(layout!.cells.length).toBeGreaterThanOrEqual(4);
  });

  it('maps labels a–n in row-major 4×4 divide grid order', () => {
    expect(exerciseCellGridPosition('a')).toEqual({ index: 0, row: 0, col: 0 });
    expect(exerciseCellGridPosition('b')).toEqual({ index: 1, row: 0, col: 1 });
    expect(exerciseCellGridPosition('e')).toEqual({ index: 4, row: 1, col: 0 });
    expect(exerciseCellGridPosition('n')).toEqual({ index: 13, row: 3, col: 1 });
    expect(EXERCISE_CELL_LABELS[13]).toBe('n');
  });

  it('returns null without heading', async () => {
    expect(
      await detectDivideExerciseGridLayout({
        imageBuffer: Buffer.alloc(8),
        pageWidth: 1400,
        pageHeight: 1867,
        transcript: 'Addition of fractions',
      }),
    ).toBeNull();
  });
});
