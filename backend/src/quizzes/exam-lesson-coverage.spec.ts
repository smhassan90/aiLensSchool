import {
  buildExamCoverageBlock,
  examExcerptBudget,
  extractFormulaLines,
  sampleLessonTextEvenly,
  splitLessonSections,
} from './exam-lesson-coverage';

describe('exam-lesson-coverage', () => {
  const waveLesson = `
Unit 10 General Wave properties
Waves transfer energy without transferring matter.

10.1 Amplitude
Amplitude is the maximum displacement from the rest position.

10.2 Wavelength
λ is the distance between the two consecutive crests.
Wavelength is measured in metres.

10.3 Frequency and period
Frequency f is the number of waves per second (Hz).
Period T = 1/f.

Worked Example
Step 2: Write down the formula
v = f × λ
λ = 8.0 m
f = 0.125 Hz

Numericals
What is the wavelength of a radio wave with frequency 1300 kHz?
`.trim();

  it('splits sections by headings', () => {
    const sections = splitLessonSections(waveLesson);
    expect(sections.length).toBeGreaterThanOrEqual(4);
    expect(sections.some((s) => /wavelength/i.test(s.title))).toBe(true);
    expect(sections.some((s) => /numerical/i.test(s.title))).toBe(true);
  });

  it('extracts formula and symbol lines', () => {
    const formulas = extractFormulaLines(waveLesson);
    expect(formulas.some((f) => /λ/.test(f))).toBe(true);
    expect(formulas.some((f) => /v\s*=\s*f/i.test(f))).toBe(true);
  });

  it('samples evenly so late formulas survive truncation', () => {
    const sampled = sampleLessonTextEvenly(waveLesson, 420);
    expect(sampled).toMatch(/Amplitude|amplitude/i);
    expect(sampled).toMatch(/λ|wavelength|v\s*=\s*f/i);
    expect(sampled.length).toBeLessThanOrEqual(420);
  });

  it('builds coverage block with checklist and formulas', () => {
    const block = buildExamCoverageBlock(waveLesson);
    expect(block).toMatch(/Section checklist/i);
    expect(block).toMatch(/Formulas & symbols/i);
    expect(block).toMatch(/λ|v\s*=\s*f/i);
  });

  it('gives a larger excerpt budget for a single lesson', () => {
    expect(examExcerptBudget(1)).toBe(7000);
    expect(examExcerptBudget(3)).toBeLessThan(examExcerptBudget(1));
  });
});
