import {
  dedupeInlineRepeatedClauses,
  formatChemicalFormulaToken,
  polishChemistryEquationLine,
  reconstructChemistryFormulasInOcrText,
} from './ocr-chemistry-formulas';
import { cleanMergedPageOcrText } from './science-ocr-clean';

describe('ocr-chemistry-formulas', () => {
  it('formats stoichiometry digits as Unicode subscripts', () => {
    expect(formatChemicalFormulaToken('H2O')).toBe('H₂O');
    expect(formatChemicalFormulaToken('Na2CO3')).toBe('Na₂CO₃');
    expect(formatChemicalFormulaToken('2NaHCO3')).toBe('2NaHCO₃');
    expect(formatChemicalFormulaToken('NH3')).toBe('NH₃');
  });

  it('repairs reaction lines with missing subscript styling', () => {
    const line = '2NaHCO3 > Na2CO3 + CO2 + H2O';
    expect(polishChemistryEquationLine(line)).toBe(
      '2NaHCO₃ → Na₂CO₃ + CO₂ + H₂O',
    );
  });

  it('repairs parenthetical subscript OCR (NaHCO(3)', () => {
    expect(formatChemicalFormulaToken('NaHCO(3')).toBe('NaHCO₃');
  });

  it('dedupes stitched duplicate intro clauses', () => {
    const dup =
      'A chemical reaction is a chemical change which involve reactants and products. For A chemical reaction is a chemical change which involve reactants and products. For.';
    expect(dedupeInlineRepeatedClauses(dup)).toBe(
      'A chemical reaction is a chemical change which involve reactants and products.',
    );
  });

  it('cleans ammonia equilibrium page fragments', () => {
    const raw = `
Chemical Equilibrium
N2(g) + 3H2(g) -> 2NH3(g)
Rate of forward reaction = Rate of reverse reaction
`.trim();
    const out = reconstructChemistryFormulasInOcrText(raw);
    expect(out).toMatch(/N₂\(g\)/);
    expect(out).toMatch(/3H₂\(g\)/);
    expect(out).toMatch(/2NH₃\(g\)/);
  });

  it('runs through cleanMergedPageOcrText on chemistry cues', () => {
    const merged = `
A chemical reaction contains reactants and products.
2NaHCO3 > Na2CO3 + CO2 + H2O
`.trim();
    const cleaned = cleanMergedPageOcrText(merged);
    expect(cleaned).toMatch(/2NaHCO₃/);
    expect(cleaned).toMatch(/Na₂CO₃/);
    expect(cleaned).toMatch(/CO₂/);
    expect(cleaned).toMatch(/H₂O/);
  });
});
