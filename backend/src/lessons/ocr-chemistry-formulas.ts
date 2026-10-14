import { wordOverlapRatio } from './ocr-layout-reconcile-utils';

const SUBSCRIPT_DIGITS: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
};

const CHEMISTRY_PAGE_CUE =
  /\b(?:chemical\s+equilibrium|reversible\s+reaction|irreversible|reactants?|products?|ammonia|haber|dynamic\s+equilibrium|mole(?:s)?\s+of\s+(?:nitrogen|hydrogen)|forward\s+reaction|reverse\s+reaction|sodium\s+bicarbonate|carbon\s+dioxide|chemical\s+reaction)\b/i;

/** True when page text looks like a chemistry chapter (equilibrium, reactions, formulas). */
export function looksLikeChemistryLessonPage(text: string): boolean {
  const value = (text ?? '').trim();
  if (!value) return false;
  if (CHEMISTRY_PAGE_CUE.test(value)) return true;
  const formulaHits =
    (value.match(/\b\d*[A-Z][a-z]?(?:\d+|\([0-9]{1,2}\))/g) ?? []).length +
    (value.match(/[A-Z][a-z]?\d+[A-Z]/g) ?? []).length;
  const arrowHits = (value.match(/(?:→|⇌|↔|>|<|\+)/g) ?? []).length;
  return formulaHits >= 4 && arrowHits >= 2;
}

function digitsToSubscript(digits: string): string {
  return digits
    .split('')
    .map((d) => SUBSCRIPT_DIGITS[d] ?? d)
    .join('');
}

/**
 * Turn ASCII stoichiometry digits after element symbols into Unicode subscripts.
 * Leading coefficient stays normal: 2NaHCO3 → 2NaHCO₃.
 */
export function formatChemicalFormulaToken(raw: string): string {
  const token = repairParentheticalSubscriptDigits((raw ?? '').trim());
  if (!token || !/[A-Z]/.test(token)) return token;

  let i = 0;
  let out = '';
  while (i < token.length && /\d/.test(token[i])) {
    out += token[i++];
  }
  while (i < token.length) {
    const ch = token[i];
    if (!/[A-Z]/.test(ch)) {
      out += ch;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
    while (i < token.length && /[a-z]/.test(token[i])) {
      out += token[i++];
    }
    let sub = '';
    while (i < token.length && /\d/.test(token[i])) {
      sub += token[i++];
    }
    if (sub) out += digitsToSubscript(sub);
  }
  return out;
}

/** OCR sometimes emits subscripts as "(3" after an element group — NaHCO(3 → NaHCO₃. */
export function repairParentheticalSubscriptDigits(token: string): string {
  return (token ?? '').replace(
    /([A-Z][A-Za-z]{0,8})\((\d{1,2})\b/g,
    (_, formula: string, sub: string) => formatChemicalFormulaToken(`${formula}${sub}`),
  );
}

function normalizeReactionArrow(segment: string): string {
  return segment
    .replace(/\s*(?:=>|->|>=|>>)\s*/g, ' → ')
    .replace(/\s*(?:<=>|<<=>>)\s*/g, ' ⇌ ')
    .replace(/\s*(?:<->)\s*/g, ' ↔ ')
    .replace(/\s*>\s*(?=[A-Z0-9(])/g, ' → ')
    .replace(/\s*<\s*(?=[A-Z0-9(])/g, ' ← ');
}

/** Fix glued gas-state OCR: N2g, 3H2g, NH3(g1 → N₂(g), 3H₂(g), NH₃(g). */
export function repairGluedGasStateNotation(token: string): string {
  let t = repairParentheticalSubscriptDigits(token);
  t = t.replace(/\(([a-z]{1,2})(\d)\)/gi, '($1)');
  t = t.replace(/\(([a-z]{1,2})\d\)/gi, '($1)');
  t = t.replace(/\(([a-z]{1,2})1\b/gi, '($1)');
  t = t.replace(
    /(\d*)([A-Z][a-z]?)(\d+)(g)\b/gi,
    (_, coeff: string, el: string, sub: string, state: string) =>
      `${coeff}${formatChemicalFormulaToken(`${el}${sub}`)}(${state.toLowerCase()})`,
  );
  t = t.replace(
    /(\d*)([A-Z][a-z]?)(\d+)\(([a-z]{1,2})\)/gi,
    (_, coeff: string, el: string, sub: string, state: string) =>
      `${coeff}${formatChemicalFormulaToken(`${el}${sub}`)}(${state.toLowerCase()})`,
  );
  return t;
}

const FORMULA_CHUNK =
  /(\d*[A-Z][A-Za-z]*(?:\d+|\([0-9]{1,2}\))*(?:\([a-z]{1,2}\))?)/g;

/** Polish one equation fragment (may include +, arrows, spaces). */
export function polishChemistryEquationFragment(fragment: string): string {
  let value = normalizeReactionArrow(repairGluedGasStateNotation(fragment.trim()));
  value = value.replace(FORMULA_CHUNK, (chunk) => {
    const cleaned = repairParentheticalSubscriptDigits(chunk);
    if (!/[A-Z]/.test(cleaned)) return chunk;
    return formatChemicalFormulaToken(cleaned.replace(/\([a-z]{1,2}\)/gi, (m) => m));
  });
  return value.replace(/[ \t]{2,}/g, ' ').trim();
}

/**
 * Textbook bicarbonate decomposition — OCR often drops all subscript digits:
 * "2NaHCO → NaCO + CO + HO" instead of 2NaHCO₃ → Na₂CO₃ + CO₂ + H₂O.
 * Only runs when the line (or page) clearly refers to bicarbonate.
 */
export function repairBicarbonateDecompositionLine(line: string, pageContext = ''): string {
  const row = (line ?? '').trim();
  const ctx = `${pageContext}\n${row}`;
  if (!/\bbicarbonate|bicorbonote|NaHCO/i.test(ctx)) return row;

  const brokenRhs = /2\s*NaHCO(?:₃|3)?\s*(?:→|>|←)\s*NaCO(?:₃|3)?\s*\+\s*CO\s*\+\s*HO\b/i;
  if (brokenRhs.test(row)) {
    return row.replace(
      /2\s*NaHCO(?:₃|3)?\s*(?:→|>|←)\s*NaCO(?:₃|3)?\s*\+\s*CO\s*\+\s*HO\b/i,
      '2NaHCO₃ → Na₂CO₃ + CO₂ + H₂O',
    );
  }

  if (/\b2\s*NaHCO\b/i.test(row) && !/NaHCO₃|NaHCO3/i.test(row)) {
    return row.replace(/\b2\s*NaHCO\b/gi, '2NaHCO₃');
  }
  if (/\bNaCO\b/i.test(row) && !/Na₂CO₃|Na2CO3/i.test(row) && /(?:→|>|\+)/.test(row)) {
    return row.replace(/\bNaCO\b/gi, 'Na₂CO₃');
  }
  return row;
}

export function polishChemistryEquationLine(line: string): string {
  const trimmed = (line ?? '').trim();
  if (!trimmed) return '';
  if (!/[A-Z]/.test(trimmed) || !/(?:\+|→|←|⇌|>|<)/.test(trimmed)) {
    return repairGluedGasStateNotation(trimmed);
  }
  const parts = trimmed.split(/(\s*[+]\s*|\s*(?:→|←|⇌|↔)\s*)/);
  return parts
    .map((p) => {
      const op = p.trim();
      if (op === '+' || op === '→' || op === '←' || op === '⇌' || op === '↔') return ` ${op} `;
      return polishChemistryEquationFragment(p);
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Paddle/Tess sometimes stitch the same intro twice on one line ("…products. For …products. For."). */
export function dedupeInlineRepeatedClauses(line: string): string {
  const value = (line ?? '').trim();
  if (value.length < 40) return value;

  const forDup = value.match(/^(.+?)\.\s*For\s+(.+)$/i);
  if (forDup) {
    const [, first, second] = forDup;
    const a = first.trim();
    let b = second.replace(/\.\s*For\.?\s*$/i, '').trim();
    if (b.endsWith('.')) b = b.slice(0, -1).trim();
    if (
      a.length >= 28 &&
      b.length >= 28 &&
      (wordOverlapRatio(a, b) >= 0.78 || b.toLowerCase().startsWith(a.toLowerCase().slice(0, 24)))
    ) {
      return `${a}.`;
    }
  }

  const sentences = value.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length >= 2) {
    const out: string[] = [];
    for (const sent of sentences) {
      const prev = out[out.length - 1];
      if (prev && wordOverlapRatio(prev, sent) >= 0.82 && sent.length >= 24) continue;
      out.push(sent);
    }
    if (out.length < sentences.length) return out.join(' ');
  }

  return value;
}

export function reconstructChemistryFormulasInOcrText(text: string): string {
  const value = (text ?? '').trim();
  if (!value) return '';
  if (!looksLikeChemistryLessonPage(value) && !/\b\d*[A-Z][a-z]?\d/.test(value)) {
    return value;
  }

  const lines = value.split(/\r?\n/);
  const out = lines.map((line) => {
    let row = dedupeInlineRepeatedClauses(line);
    row = repairBicarbonateDecompositionLine(row, value);
    const looksEquation =
      /(?:\+|→|←|⇌|>|<)/.test(row) &&
      /[A-Z][a-z]?/.test(row) &&
      (/\d/.test(row) || /\bNaHCO|NaCO\b/i.test(row));
    const looksFormula = /\b\d*[A-Z][a-z]?\d+[A-Za-z]*/.test(row) || /\([0-9]{1,2}\)/.test(row);
    if (looksEquation || looksFormula) {
      row = polishChemistryEquationLine(row);
    } else {
      row = repairGluedGasStateNotation(row);
    }
    return row;
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
