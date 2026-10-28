/** Split available teaching days across chapters (min 1 day each, weighted by content). */
export function allocateTeachingDaysPerChapter(
  weights: number[],
  totalTeachingDays: number,
  reserveActivityDays: number,
): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const teachDays = Math.max(n, totalTeachingDays - reserveActivityDays);
  const sum = weights.reduce((a, b) => a + b, 0) || n;
  const raw = weights.map((w) => (w / sum) * teachDays);
  const floors = raw.map((r) => Math.max(1, Math.floor(r)));
  let used = floors.reduce((a, b) => a + b, 0);
  const result = [...floors];
  let i = 0;
  while (used > teachDays) {
    const idx = i % n;
    if (result[idx] > 1) {
      result[idx]--;
      used--;
    }
    i++;
    if (i > n * 20) break;
  }
  i = 0;
  while (used < teachDays) {
    result[i % n]++;
    used++;
    i++;
  }
  return result;
}

export function splitParagraphsAcrossDays(text: string, days: number): string[] {
  const cleaned = text.replace(/\r/g, '').trim();
  if (!cleaned || days <= 0) return [];
  const paras = cleaned
    .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z])/)
    .map((p) => p.trim())
    .filter((p) => p.length > 15);
  if (paras.length === 0) {
    const chunk = Math.ceil(cleaned.length / days);
    return Array.from({ length: days }, (_, i) => cleaned.slice(i * chunk, (i + 1) * chunk)).filter(Boolean);
  }
  const out: string[] = Array.from({ length: days }, () => '');
  for (let i = 0; i < paras.length; i++) {
    out[i % days] += (out[i % days] ? '\n\n' : '') + paras[i];
  }
  return out.map((s) => s.trim()).filter(Boolean);
}
