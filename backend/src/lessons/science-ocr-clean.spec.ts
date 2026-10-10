import {
  cleanMergedPageOcrText,
  collapseRepeatedNumericTokens,
  normalizeScienceNotationArtifacts,
  stripConfidenceLikeJunk,
  stripLeadingMarkNoise,
} from './science-ocr-clean';
import { filterPageTextForLessonAssembly } from './page-text-sanitize';
import { mergePaddleAndTesseractPageOcr } from './merge-paddle-tesseract-ocr';
import { lineLooksLikeMathOrFormula } from '../common/math-lesson-text';

describe('science-ocr-clean', () => {
  it('collapses repeated numbers and confidence-like junk', () => {
    expect(collapseRepeatedNumericTokens('frequency of 1300 1300 1300 kHz')).toBe(
      'frequency of 1300 kHz',
    );
    expect(stripConfidenceLikeJunk('1300 57% SRR 5 Where')).toMatch(/1300/);
    expect(stripConfidenceLikeJunk('1300 57% SRR 5 Where')).not.toMatch(/57%|SRR/);
    expect(stripLeadingMarkNoise('Ya What is the wavelength')).toBe(
      'What is the wavelength',
    );
  });

  it('normalizes superscript unit OCR artifacts only (no invented wording)', () => {
    const raw =
      'Where 1K the 103, and the speed is 3x10" ms. (1.28ms™) When g=9.8 m s21';
    const cleaned = normalizeScienceNotationArtifacts(raw);
    expect(cleaned).toMatch(/1K = 10\^3/);
    expect(cleaned).toMatch(/3 × 10\^8 ms/);
    expect(cleaned).toMatch(/1\.28ms\^-1/);
    expect(cleaned).toMatch(/m s\^-2/);
  });

  it('cleans a physics numericals merge dump without inventing lesson sentences', () => {
    const paddle = `
Section (C) Numericals
Ya What is the wavelength of a radio wave broadcasted by a radio station with a
frequency of 1300 1300 1300 57% SRR 5
Where 1K the 103, and the speed of the radio-wave is 3x10" ms. (230.76m)
Calculate the speed of these water waves. (1.28ms™)
`.trim();
    const tess = `
Section (C) Numericals
What is the wavelength of a radio wave broadcasted by a radio station with a
frequency of 1300 kHz
Where 1K = 10^3, and the speed of the radio-wave is 3x10^8 ms^-1. (230.76m)
Calculate the speed of these water waves. (1.28ms^-1)
`.trim();
    const merged = mergePaddleAndTesseractPageOcr(paddle, tess);
    expect(merged).toMatch(/Section \(C\) Numericals/i);
    expect(merged).toMatch(/wavelength/i);
    expect(merged).not.toMatch(/1300 1300/);
    expect(merged).not.toMatch(/57%|SRR/);
    expect(merged).not.toMatch(/^Ya /m);
    expect(merged).not.toMatch(/ms™/);
  });

  it('does not treat long frequency questions as protected math lines', () => {
    expect(
      lineLooksLikeMathOrFormula(
        'What is the wavelength of a radio wave broadcasted by a radio station with a frequency of 1300 kHz?',
      ),
    ).toBe(false);
    expect(lineLooksLikeMathOrFormula('f = 0.125 Hz')).toBe(true);
  });

  it('does not invent λ/θ/π from latin OCR guesses (recognizer must emit glyphs)', () => {
    const raw = `
mg sin theeta and mg cos theeta
iv. is the distance between the two consecutive crests
b.v=fx
T=2n Vg
`.trim();
    const cleaned = cleanMergedPageOcrText(raw);
    expect(cleaned).not.toMatch(/λ/);
    expect(cleaned).not.toMatch(/θ/);
    expect(cleaned).not.toMatch(/π/);
    expect(cleaned).toMatch(/theeta|crests|v=f/i);
  });

  it('keeps Dignity of Work literary text unchanged by science notation normalize', () => {
    const literary = `Pre-reading
Akhtar and Rukhsana talked about the Dignity of Work.
Uncle Inayat said the Holy Prophet (PBUH) taught dignity of labour at Khandaq.`;
    expect(filterPageTextForLessonAssembly(literary)).toMatch(/Dignity of Work/);
    expect(filterPageTextForLessonAssembly(literary)).toMatch(/Khandaq/);
    expect(cleanMergedPageOcrText(literary)).toBe(literary);
  });

  it('does not invent electrostatics chapter opener wording', () => {
    const raw = `
as electrostatics or static electricity.
14.1 Electric charge
Charge is a basic characteristic of matter that causes electrical processes.
Like charges repel each other
`.trim();
    const cleaned = cleanMergedPageOcrText(raw);
    expect(cleaned).not.toMatch(/In this chapter, we will discuss the various characteristics/i);
    expect(cleaned).toMatch(/14\.1 Electric charge/);
    expect(cleaned).toMatch(/Charge is a basic characteristic/);
  });
});
