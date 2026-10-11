/** Higher = more column-bleed / OCR junk in merged transcript. */
export function transcriptNoiseScore(text: string): number {
  const t = (text ?? '').trim();
  if (!t) return 0;
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let score = 0;
  score += (t.match(/\|/g) ?? []).length * 2;
  score += lines.filter((l) => l.length <= 2).length * 3;
  score += lines.filter((l) => /^[\s|iIe©=]+$/.test(l)).length * 4;
  score += (t.match(/\bRe NE\b/i) ? 8 : 0);
  return score;
}

export function wordOverlapRatio(a: string, b: string): number {  const wa = new Set(
    a
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
  const wb = new Set(
    b
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) {
    if (wb.has(w)) inter += 1;
  }
  return inter / Math.max(wa.size, wb.size);
}
