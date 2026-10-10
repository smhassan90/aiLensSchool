import {
  cleanMergedPageOcrText,
  collapseRepeatedNumericTokens,
  normalizeScienceNotationArtifacts,
  restoreElectrostaticsFormulas,
  restorePhysicsMathSymbols,
  restoreWavelengthLambdaSymbols,
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

  it('normalizes superscript unit OCR artifacts', () => {
    const raw =
      'Where 1K the 103, and the speed is 3x10" ms. (1.28ms™) When g=9.8 m s21';
    const cleaned = normalizeScienceNotationArtifacts(raw);
    expect(cleaned).toMatch(/1K = 10\^3/);
    expect(cleaned).toMatch(/3 × 10\^8 ms/);
    expect(cleaned).toMatch(/1\.28ms\^-1/);
    expect(cleaned).toMatch(/m s\^-2/);
  });

  it('cleans a physics numericals merge dump', () => {
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

  it('restores theta, pi, sqrt, infinity, approx, and frequency symbols', () => {
    const raw = `
mg sin theeta and mg cos theeta
T = 2n V(L/g)
pie = 22/7
pie2 ≅ 9.86
f = 1/T
a oc -x
amplitude tends to infinity
A = 1/2(3.0m)
`.trim();
    const cleaned = restorePhysicsMathSymbols(raw);
    expect(cleaned).toMatch(/sin θ/);
    expect(cleaned).toMatch(/cos θ/);
    expect(cleaned).toMatch(/T = 2π√\(L\/g\)/);
    expect(cleaned).toMatch(/π ≅ 22\/7/);
    expect(cleaned).toMatch(/π²/);
    expect(cleaned).toMatch(/f = 1\/T/);
    expect(cleaned).toMatch(/a ∝ -x/);
    expect(cleaned).toMatch(/∞/);
    expect(cleaned).toMatch(/1\/2\s*\(?3\.0m/);
  });

  it('restores live paddle SHM/period and wave frequency OCR garbage', () => {
    const shm = `
Force balance equations:
mg sine
mg cos
mg cos0 along the string and mg sin0 perpendicular
equals mg sine.
For the simple pendulum executing SHM, we have the
following formula for its period;
T=2
Vg
`.trim();
    const shmClean = cleanMergedPageOcrText(shm);
    expect(shmClean).toMatch(/mg sin θ/);
    expect(shmClean).toMatch(/mg cos θ/);
    expect(shmClean).toMatch(/T = 2π√\(L\/g\)/);

    const wave = `
f=1
T
iii. A is the one-half of displacement from the highest
iv.
is the distance between the two consecutive crests
b.v=f
f=1
ii.
8s
=0.125 Hz.
A=1(3.0m)
`.trim();
    const waveClean = cleanMergedPageOcrText(wave);
    expect(waveClean).toMatch(/f = 1\/T/);
    expect(waveClean).toMatch(/f = 1\/8s/);
    expect(waveClean).toMatch(/A = 1\/2/);
    expect(waveClean).toMatch(/λ/);
    expect(waveClean).toMatch(/v = f × λ/);
  });

  it('restores Greek λ when OCR drops wavelength symbols', () => {
    const raw = `
Step 2:Write down the formula and rearrange if necessary.
iv. is the distance between the two consecutive crests
b.v=fx
Step 3:Put the values and calculate
iv.
=8.0m.
b.v=0.125Hz8.0m
Thus, the period, frequency, amplitude, and wavelength of the waves are 8.0s
`.trim();
    const cleaned = restoreWavelengthLambdaSymbols(raw);
    expect(cleaned).toMatch(/λ is the distance between the two consecutive crests/);
    expect(cleaned).toMatch(/v = f × λ/);
    expect(cleaned).toMatch(/λ = 8\.0m/);
    const merged = cleanMergedPageOcrText(raw);
    expect(merged).toMatch(/λ/);
    expect(merged).toMatch(/v = f × λ/);
  });

  it('keeps Dignity of Work literary text unchanged by science notation normalize', () => {
    const literary = `Pre-reading
Akhtar and Rukhsana talked about the Dignity of Work.
Uncle Inayat said the Holy Prophet (PBUH) taught dignity of labour at Khandaq.`;
    expect(filterPageTextForLessonAssembly(literary)).toMatch(/Dignity of Work/);
    expect(filterPageTextForLessonAssembly(literary)).toMatch(/Khandaq/);
    expect(cleanMergedPageOcrText(literary)).toBe(literary);
  });

  it('restores electrostatics chapter opener from fragments', () => {
    const raw = `
various characteristics of static charges
well as precautions against its use will be covered
as electrostatics or static electricity.
14.1 Electric charge
Charge is a basic characteristic of matter that causes electrical processes.
Like charges repel each other
`.trim();
    const cleaned = cleanMergedPageOcrText(raw);
    expect(cleaned).toMatch(/In this chapter, we will discuss the various characteristics/i);
    expect(cleaned).toMatch(/14\.1 Electric charge/);
    expect(cleaned).toMatch(/Charge is a basic characteristic/);
  });

  it('keeps body between duplicate 14.1 headers and restores production paragraph', () => {
    const raw = `
as electrostatics or static electricity.
14.1 Electric charge
Charge is a basic characteristic of matter that causes electrical processes.
Like charges repel each other
Opposite charges attract each other
14.1 Electric eharge
Production of electric.charge
shown in figure 14.2.
atract the
`.trim();
    const cleaned = cleanMergedPageOcrText(raw);
    expect(cleaned).toMatch(/In this chapter, we will discuss the various characteristics/i);
    expect(cleaned).toMatch(/Charge is a basic characteristic/);
    expect(cleaned).toMatch(/Like charges repel each other/);
    expect(cleaned).toMatch(/Opposite charges attract each other/);
    expect(cleaned).toMatch(/When we comb our hair with a plastic comb/);
    expect(cleaned).not.toMatch(/14\.1 Electric charge\s*\n\s*14\.1 Electric charge/);
  });

  it('restores electrostatics formulas and scientific notation', () => {
    const raw = `
14.4 Coulomb's law
Electrostatics
F=K992
K9.0x10N-m/C2
=8.85x10-12C/N-m
of1.60217663410-19coulomb.
Result: The required force of attraction between two point charge is F=54x108N
q=I
q=n
C = Q / V
1uF and connected parallel.
Cnet=1+1+1+1F
C oc A
`.trim();
    const restored = restoreElectrostaticsFormulas(raw);
    expect(restored).toMatch(/F = k q₁ q₂ \/ r²/);
    expect(restored).toMatch(/1\.602176634 × 10\^-19 C/);
    expect(restored).toMatch(/F = 5\.4 × 10\^8 N/);
    expect(restored).toMatch(/q = I · t/);
    expect(restored).toMatch(/q = n · e/);
    expect(restored).toMatch(/1 μF/);
    expect(restored).toMatch(/C ∝ A/);

    const cleaned = cleanMergedPageOcrText(raw);
    expect(cleaned).toMatch(/10\^-19/);
    expect(cleaned).toMatch(/μF|F = k/);
  });
});
