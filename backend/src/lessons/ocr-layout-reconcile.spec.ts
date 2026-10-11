import { dedupeNearDuplicateLines, mergePageOcr, reconcilePageOcr } from './ocr-layout-reconcile';
import { mergePaddleAndTesseractPageOcr } from './merge-paddle-tesseract-ocr';

describe('ocr-layout-reconcile', () => {
  it('dedupes duplicate opening sentences from different engines', () => {
    const lines = dedupeNearDuplicateLines([
      'Now we will deal with addition, subtraction, multiplication, and',
      'Now we will deal with additionsubtractionmultiplication and',
      'division of different types of fractions.',
    ]);
    expect(lines.filter((l) => /Now we will deal/i.test(l)).length).toBe(1);
    expect(lines.join('\n')).toMatch(/addition, subtraction/);
  });

  it('falls back to legacy merge when structured lines are missing', () => {
    const paddle = 'Hello world';
    const tesseract = 'Hello world!';
    const legacy = mergePaddleAndTesseractPageOcr(paddle, tesseract);
    const out = reconcilePageOcr({ paddle, tesseract });
    expect(out.usedLayoutReconcile).toBe(false);
    expect(out.plainText).toBe(legacy);
  });

  it('uses structured lines when provided', () => {
    const result = reconcilePageOcr({
      paddle: 'a. 1 2/5\nReduce fractions.\nb. 2/3',
      tesseract: 'a. 1 2/5 ÷ 4/5\nReduce fractions.\nb. 2/3',
      paddleLines: [
        { text: 'Reduce fractions.', x0: 10, y0: 40, x1: 120, y1: 60, engine: 'paddle' },
        { text: 'a. 1 2/5', x0: 10, y0: 100, x1: 80, y1: 130, engine: 'paddle' },
        { text: 'b. 2/3', x0: 10, y0: 200, x1: 60, y1: 220, engine: 'paddle' },
      ],
      tesseractLines: [
        { text: 'Reduce fractions.', x0: 10, y0: 42, x1: 120, y1: 62, engine: 'tesseract' },
        {
          text: 'a. 1 2/5 ÷ 4/5',
          x0: 10,
          y0: 102,
          x1: 120,
          y1: 132,
          engine: 'tesseract',
          confidence: 0.9,
        },
        { text: 'b. 2/3', x0: 10, y0: 202, x1: 60, y1: 222, engine: 'tesseract' },
      ],
      subjectName: 'Mathematics',
    });
    expect(result.usedLayoutReconcile).toBe(true);
    expect(result.plainText).toMatch(/÷/);
  });

  it('mergePageOcr improves duplicate intro case vs raw concat', () => {
    const paddle = `
Now we will deal with additionsubtraction, multiplication, and
Now we will deal with additionsubtractionmultiplication and
division of different types of fractions.
`.trim();
    const tess = `
Now we will deal with addition, subtraction, multiplication, and
division of different types of fractions.
`.trim();
    const merged = mergePageOcr({ paddle, tesseract: tess, subjectName: 'Mathematics' });
    expect(merged.match(/Now we will deal/gi)?.length ?? 0).toBeLessThanOrEqual(1);
  });
});
