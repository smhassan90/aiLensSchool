/**
 * Conservative LaTeX / Pix2Text markup → plain text for lesson assembly.
 */

export function collapseSpacedDigits(s: string): string {
  let out = s ?? '';
  let prev: string | null = null;
  while (out !== prev) {
    prev = out;
    out = out.replace(/(\d) (\d)/g, '$1$2');
  }
  return out;
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
  return lines.join('\n').trim();
}
