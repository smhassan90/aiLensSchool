/**
 * Conservative LaTeX / Pix2Text markup → plain text for lesson assembly.
 */

/** Protect mixed numbers (whole + num/den) before collapsing OCR digit spacing. */
const MIXED_NUMBER_PLACEHOLDER = '\uE000';

export function protectMixedNumberFractions(s: string): { text: string; restore: (t: string) => string } {
  const slots: string[] = [];
  const text = (s ?? '').replace(
    /(\d+)\s+(\d+)\s*\/\s*(\d+)/g,
    (_, whole: string, num: string, den: string) => {
      slots.push(`${whole} ${num}/${den}`);
      return `${MIXED_NUMBER_PLACEHOLDER}${slots.length - 1}${MIXED_NUMBER_PLACEHOLDER}`;
    },
  );
  return {
    text,
    restore: (t: string) => {
      let out = t;
      for (let i = 0; i < slots.length; i++) {
        out = out.replace(`${MIXED_NUMBER_PLACEHOLDER}${i}${MIXED_NUMBER_PLACEHOLDER}`, slots[i]);
      }
      return out;
    },
  };
}

export function collapseSpacedDigits(s: string): string {
  const { text, restore } = protectMixedNumberFractions(s ?? '');
  let out = text;
  let prev: string | null = null;
  while (out !== prev) {
    prev = out;
    out = out.replace(/(\d) (\d)/g, '$1$2');
  }
  return restore(out);
}

export function latexFracToPlain(s: string): string {
  let t = s ?? '';
  t = t.replace(/\$+/g, ' ');
  t = t.replace(/\\div\s*/g, '÷');
  t = t.replace(/\\times\s*/g, '×');
  for (let i = 0; i < 8; i++) {
    const t2 = t.replace(
      /\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,
      (_, a: string, b: string) => `${a.trim()}/${b.trim()}`,
    );
    if (t2 === t) break;
    t = t2;
  }
  t = t.replace(/\\[a-zA-Z]+\s*/g, ' ');
  t = t.replace(/[{}]/g, ' ');
  return collapseSpacedDigits(t);
}

/** Normalized plain text for matching and display (lowercase, whitespace). */
export function normalizePix2TextPlain(s: string): string {
  const t = latexFracToPlain(s)
    .replace(/\s+/g, ' ')
    .replace(/×/g, '×')
    .trim();
  return t;
}

export function pix2textPlainForFusion(raw: string): string {
  const lines = (raw ?? '')
    .split(/\r?\n/)
    .map((l) => latexFracToPlain(l).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const joined = lines.join('\n').trim();
  return stripPix2TextExerciseLabelPrefix(joined);
}

/** Remove leading exercise label when Pix2Text included it in mathrm/text (not GT-derived). */
export function stripPix2TextExerciseLabelPrefix(plain: string): string {
  return plain.replace(/^\s*[a-n]\s*\.\s*/i, '').trim();
}
