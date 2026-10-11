/**
 * Reconstruct textbook stacked fractions from OCR layout.
 *
 * Printed form is often:
 *   3   8   6
 *   ─   ─   ─
 *   4  11   4
 * which engines flatten to digit soup ("Example3869102792"). We restore 3/4
 * (slash form) from paired numerator/denominator rows — digits come from OCR,
 * we only restore the fraction relationship (not invent missing values).
 */

/** Common 2-digit denominators/numerators in primary textbooks. */
const PREFERRED_TWO_DIGIT = new Set([
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '24',
  '25',
]);

export function tokenizeDigits(line: string): string[] {
  return line.match(/\d{1,3}/g) ?? [];
}

/**
 * Apostrophe between digits is often OCR for "11" on fraction rows
 * (e.g. 4'4… → 4, 11, 4…). Trailing/orphan quotes are dropped.
 */
export function normalizeFractionDigitLine(line: string): string {
  let s = (line ?? '').trim();
  if (!s) return '';
  s = s.replace(/(\d)'(\d)/g, '$1 11 $2');
  s = s.replace(/^'(\d)/g, '11 $1');
  s = s.replace(/(\d)'$/g, '$1');
  s = s.replace(/'/g, ' ');
  s = s.replace(/[–—−]/g, ' ');
  s = s.replace(/[^\d\s]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function lineIsMostlyDigitTokens(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/[a-z]{3,}/i.test(trimmed) && !/^example/i.test(trimmed)) return false;
  const normalized = normalizeFractionDigitLine(trimmed.replace(/^example/i, ''));
  const digits = tokenizeDigits(normalized || trimmed);
  if (digits.length < 2 && !/^\d{4,}/.test(trimmed.replace(/\D/g, ''))) return false;
  const compact = trimmed.replace(/[^a-z0-9']/gi, '');
  const digitChars = (compact.match(/\d/g) ?? []).length;
  return digitChars / Math.max(1, compact.length) >= 0.45;
}

export function stripExamplePrefix(line: string): { prefix: string; rest: string } {
  const spaced = line.match(/^(Example\s*[:;.]?\s+)(.*)$/i);
  if (spaced) return { prefix: spaced[1], rest: spaced[2] };
  // Paddle often glues: Example3869102792
  const glued = line.match(/^(Example)(\d.*)$/i);
  if (glued) return { prefix: `${glued[1]}: `, rest: glued[2] };
  return { prefix: '', rest: line };
}

/**
 * Partition a digit run into `count` tokens of 1–2 digits.
 * Prefers textbook 2-digit values (10–25) when an extra digit must be consumed.
 */
export function splitDigitRunToCount(digits: string, count: number): string[] | null {
  const d = digits.replace(/\D/g, '');
  if (count < 2 || d.length < count || d.length > count * 2) return null;
  const parts: string[] = [];
  let pos = 0;
  for (let k = 0; k < count; k += 1) {
    const remainingParts = count - k;
    const remainingDigits = d.length - pos;
    if (remainingDigits < remainingParts || remainingDigits > remainingParts * 2) {
      return null;
    }
    if (remainingDigits === remainingParts) {
      parts.push(d[pos]!);
      pos += 1;
      continue;
    }
    const two = d.slice(pos, pos + 2);
    const takeTwo =
      remainingDigits === remainingParts * 2 ||
      PREFERRED_TWO_DIGIT.has(two) ||
      remainingDigits - 1 > remainingParts * 2 - 2;
    if (takeTwo && pos + 2 <= d.length) {
      parts.push(two);
      pos += 2;
    } else {
      parts.push(d[pos]!);
      pos += 1;
    }
  }
  return pos === d.length ? parts : null;
}

/**
 * Tokenize a fraction digit row. Apostrophes → 11; long glued runs are
 * partitioned into 1–2 digit textbook tokens.
 */
export function extractFractionDigitTokens(line: string): string[] {
  const normalized = normalizeFractionDigitLine(line);
  const glued = normalized.replace(/\D/g, '') || line.replace(/\D/g, '');
  if (!glued) return [];
  const spaced = normalized.split(/\s+/).filter((t) => /^\d{1,2}$/.test(t));
  if (spaced.length >= 2 && spaced.join('').length === glued.length) {
    return spaced;
  }
  // Prefer a count that uses preferred 2-digit dens (11,13,…) when possible.
  const maxCount = Math.min(12, glued.length);
  const minCount = Math.max(2, Math.ceil(glued.length / 2));
  let best: string[] | null = null;
  let bestScore = -1;
  for (let c = maxCount; c >= minCount; c -= 1) {
    const split = splitDigitRunToCount(glued, c);
    if (!split) continue;
    const score =
      split.length * 2 +
      split.filter((p) => PREFERRED_TWO_DIGIT.has(p)).length * 5 +
      split.filter((p) => p.length === 1).length;
    if (score > bestScore) {
      bestScore = score;
      best = split;
    }
  }
  return best ?? tokenizeDigits(normalized || line);
}

/** Pair nth numerator with nth denominator → "3/4, 8/11". */
export function pairFractionDigitRows(numLine: string, denLine: string): string | null {
  let dens = extractFractionDigitTokens(denLine);
  let nums = extractFractionDigitTokens(numLine);
  const numGlued = numLine.replace(/\D/g, '');
  const denGlued =
    normalizeFractionDigitLine(denLine).replace(/\D/g, '') || denLine.replace(/\D/g, '');

  // Only re-split a side when token counts disagree (avoid breaking "11" → 1,18).
  if (
    dens.length >= 2 &&
    nums.length !== dens.length &&
    numGlued.length >= dens.length &&
    numGlued.length <= dens.length * 2
  ) {
    const split = splitDigitRunToCount(numGlued, dens.length);
    if (split) nums = split;
  } else if (
    nums.length >= 2 &&
    nums.length !== dens.length &&
    denGlued.length >= nums.length &&
    denGlued.length <= nums.length * 2
  ) {
    const split = splitDigitRunToCount(denGlued, nums.length);
    if (split) dens = split;
  }

  if (nums.length < 2 || dens.length < 2) return null;
  const n = Math.min(nums.length, dens.length);
  if (n < 2) return null;
  if (Math.abs(nums.length - dens.length) > 3) return null;
  const parts: string[] = [];
  for (let i = 0; i < n; i += 1) {
    if (dens[i] === '0') continue;
    parts.push(`${nums[i]}/${dens[i]}`);
  }
  return parts.length >= 2 ? parts.join(', ') : null;
}

/**
 * When OCR glued numerators ("86916…") but denominators are separate tokens,
 * split the glued run so counts can align.
 */
export function splitGluedDigitsToMatchCount(glued: string, denCount: number): string | null {
  const parts = splitDigitRunToCount(glued, denCount);
  return parts ? parts.join(' ') : null;
}

/** Leading digit tokens, allowing trailing prose ("2 4 6 10 are equivalent…"). */
function leadingDigitChunk(line: string): string | null {
  const t = line.replace(/^example\s*[:;.]?\s*/i, '').trim();
  const m = t.match(/^([\d'\s]{2,}?)(?:\s+(?:are|is|were|equivalent)\b[\s\S]*)?$/i);
  if (m && m[1].replace(/\D/g, '').length >= 2) {
    return normalizeFractionDigitLine(m[1]);
  }
  // "2 4 6 10 are equivalent fractions"
  const m2 = t.match(/^((?:\d{1,3}[\s,]*){2,})\s+[a-z]/i);
  if (m2) return normalizeFractionDigitLine(m2[1]);
  if (lineIsMostlyDigitTokens(t) || /^[\d'\s]{3,}$/.test(t)) {
    return normalizeFractionDigitLine(t) || t;
  }
  return null;
}

function collectDenominatorLine(lines: string[], startIdx: number): { text: string; used: number[] } | null {
  const used: number[] = [];
  const chunks: string[] = [];
  for (let j = startIdx; j < Math.min(startIdx + 5, lines.length); j += 1) {
    const t = lines[j].trim();
    if (!t || /^[-–—_=‾¯\s|]+$/.test(t)) {
      if (chunks.length) used.push(j);
      continue;
    }
    const chunk = leadingDigitChunk(t);
    if (!chunk) {
      // Skip a short prose line to pick up a stray den like "11" after KEY/VOCAB noise.
      if (!chunks.length && t.length < 48 && !/^\d/.test(t)) continue;
      if (chunks.length) break;
      if (/[a-z]{4,}/i.test(t)) break;
      continue;
    }
    chunks.push(chunk);
    used.push(j);
    // Keep absorbing tiny trailing dens like a lone "11" (may be 1–2 lines down).
    for (let k = j + 1; k < Math.min(j + 4, lines.length); k += 1) {
      const next = lines[k].trim();
      if (!next) continue;
      if (/^\d{1,3}$/.test(next)) {
        chunks.push(next);
        used.push(k);
        break;
      }
      if (next.length < 48 && !/^\d/.test(next)) continue;
      break;
    }
    break;
  }
  if (!chunks.length) return null;
  return { text: chunks.join(' '), used };
}

/**
 * Rebuild stacked fraction example rows across the page transcript.
 * Uses slash form (3/4) — portable in lesson text. For a visual stacked block
 * use {@link formatStackedFractionBlock}.
 */
export function reconstructStackedFractionsInOcrText(text: string): string {
  const value = (text ?? '').trim();
  if (!value) return '';
  if (!/\bfraction/i.test(value) && !/\bExample/i.test(value)) return value;

  const lines = value.split(/\r?\n/);
  const out: string[] = [];
  const used = new Set<number>();

  for (let i = 0; i < lines.length; i += 1) {
    if (used.has(i)) continue;
    const raw = lines[i];
    const { prefix, rest } = stripExamplePrefix(raw.trim());
    const candidateNum = prefix ? rest : raw.trim();
    const glued = candidateNum.replace(/\D/g, '');
    // Skip worked-example ÷ chains / already-stacked bars.
    if (
      /[÷─]/.test(raw) ||
      /^\d{2,4}(?:\s*=\s*\d{1,4}){1,}/.test(raw.trim().replace(/\s/g, ''))
    ) {
      out.push(raw);
      continue;
    }

    const looksNumRow =
      (Boolean(prefix) && (lineIsMostlyDigitTokens(rest) || glued.length >= 4)) ||
      (!prefix && lineIsMostlyDigitTokens(raw) && glued.length >= 4);

    if (!looksNumRow) {
      out.push(raw);
      continue;
    }

    const denPack = collectDenominatorLine(lines, i + 1);
    if (!denPack) {
      out.push(raw);
      continue;
    }

    const rebuilt = pairFractionDigitRows(candidateNum, denPack.text);
    if (rebuilt) {
      out.push(prefix ? `${prefix}${rebuilt}` : rebuilt);
      for (const u of denPack.used) used.add(u);
      const firstDen = Math.min(...denPack.used);
      for (let j = i + 1; j < firstDen; j += 1) {
        if (/^[-–—_=‾¯\s|]+$/.test(lines[j].trim())) used.add(j);
      }
      continue;
    }

    out.push(raw);
  }

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Count restored slash fractions — used to prefer transcripts that keep examples. */
export function countSlashFractions(text: string): number {
  return (text.match(/\b\d{1,3}\/\d{1,3}\b/g) ?? []).length;
}

/** Visual stacked fraction (numerator / bar / denominator) for display. */
export function formatStackedFractionBlock(numerator: string, denominator: string): string {
  const num = numerator.trim();
  const den = denominator.trim();
  const bar = '─'.repeat(Math.max(3, Math.max(num.length, den.length) + 2));
  const center = (s: string) => {
    const space = Math.max(0, bar.length - s.length);
    const left = Math.floor(space / 2);
    return `${' '.repeat(left)}${s}`;
  };
  return `${center(num)}\n${bar}\n${center(den)}`;
}

/** Mixed number as written in books: whole + stacked fraction, or "4 2/5". */
export function formatMixedNumber(
  whole: string,
  numerator: string,
  denominator: string,
  style: 'slash' | 'stacked' = 'slash',
): string {
  const w = whole.trim();
  if (style === 'stacked') {
    const block = formatStackedFractionBlock(numerator, denominator);
    const [n, bar, d] = block.split('\n');
    const pad = ' '.repeat(w.length + 1);
    return `${w} ${n.trimStart()}\n${pad}${bar}\n${pad}${d.trimStart()}`;
  }
  return `${w} ${numerator.trim()}/${denominator.trim()}`;
}

/**
 * General OCR repair: engines often drop the ÷ glyph inside a stacked fraction
 * cell, gluing dividend+divisor ("36"+"3" → "363"). Not page-specific.
 * Only applies when the last digit is a single-digit divisor 2–9.
 */
export function parseGluedDividendDivisor(token: string): string {
  const t = token.trim();
  if (!/^\d{2,4}$/.test(t)) return t;
  if (t.length <= 2) return t;
  const div = t.slice(-1);
  const left = t.slice(0, -1);
  if (/^[2-9]$/.test(div) && /^(?:\d|[1-9]\d)$/.test(left)) {
    return `${left}÷${div}`;
  }
  return t;
}

/** Join stacked fraction steps with " = " between columns. */
export function formatStackedFractionEquation(
  steps: Array<{ num: string; den: string }>,
): string {
  if (!steps.length) return '';
  const blocks = steps.map((s) => formatStackedFractionBlock(s.num, s.den).split('\n'));
  const gap = '  =  ';
  const rows = [0, 1, 2].map((row) => blocks.map((b) => b[row]).join(gap));
  return rows.join('\n');
}

function segmentLeftValue(seg: string): number {
  const digits = seg.replace(/\D/g, '');
  if (!digits) return 0;
  if (digits.length <= 2) return Number(digits);
  return Number(digits.slice(0, -1));
}

/** Re-order den tokens (OCR often emits right→left) to align with num chain. */
export function alignDenSegsToNumSegs(numSegs: string[], denSegs: string[]): string[] {
  if (denSegs.length <= 1) return denSegs;
  const used = new Set<number>();
  const out: string[] = [];
  for (const ns of numSegs) {
    const nLeft = segmentLeftValue(ns);
    let best = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < denSegs.length; i += 1) {
      if (used.has(i)) continue;
      const dLeft = segmentLeftValue(denSegs[i]);
      const score = Math.abs(dLeft - nLeft) + (dLeft < nLeft ? 20 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best >= 0) {
      used.add(best);
      out.push(denSegs[best]!);
    }
  }
  for (let i = 0; i < denSegs.length; i += 1) {
    if (!used.has(i)) out.push(denSegs[i]!);
  }
  return out.slice(0, numSegs.length);
}

/**
 * When OCR drops ÷ inside stacked reduce steps, digit rows look like:
 *   <num÷d>=<num÷d>=<ans>   over   <den÷d> <den÷d> <ansDen>
 * Restore ÷ from the glued tokens (any textbook numbers — not one page).
 */
export function reconstructGluedDivFractionChain(
  numLine: string,
  denLine: string,
): string | null {
  const numSegs = numLine
    .split(/=+/)
    .map((s) => s.replace(/[^\d]/g, ''))
    .filter(Boolean);
  if (numSegs.length < 2) return null;

  let denSegs = denLine
    .trim()
    .split(/\s+/)
    .map((s) => s.replace(/[^\d]/g, ''))
    .filter(Boolean);
  if (denSegs.length === 1 && denSegs[0].length >= 5) {
    const g = denSegs[0];
    if (numSegs.length === 2 && g.length >= 5) {
      // Glued final dens: <den÷d><ansDen> (e.g. 5 digits → 3+2)
      denSegs = [g.slice(0, -2), g.slice(-2)];
    }
  }
  if (denSegs.length < Math.max(2, numSegs.length - 1)) return null;
  denSegs = alignDenSegsToNumSegs(numSegs, denSegs);

  const steps: Array<{ num: string; den: string }> = [];
  for (let i = 0; i < numSegs.length; i += 1) {
    const denRaw = denSegs[i] ?? denSegs[denSegs.length - 1]!;
    if (i === numSegs.length - 1 && numSegs[i].length <= 2 && denRaw.length <= 2) {
      steps.push({ num: numSegs[i]!, den: denRaw });
    } else {
      steps.push({
        num: parseGluedDividendDivisor(numSegs[i]!),
        den: parseGluedDividendDivisor(denRaw),
      });
    }
  }
  if (steps.length < 2) return null;
  if (!steps.some((s) => s.num.includes('÷') || s.den.includes('÷'))) return null;
  return formatStackedFractionEquation(steps);
}

/**
 * Layout-only repair for glued ÷ fraction chains + mixed-number spacing.
 * Does not invent lesson prose. Glyph learning for ÷ / mixed forms belongs in
 * backend/ocr/training/.
 */
export function reconstructWorkedFractionMathInOcrText(text: string): string {
  const value = (text ?? '').trim();
  if (!value) return '';
  // Cheap gate: only run when digit=digit chains or mixed slash forms appear.
  if (!/\d{2,4}\s*=\s*\d{1,4}/.test(value) && !/\d\s+\d\s*\/\s*\d/.test(value)) {
    return value;
  }

  const lines = value.split(/\r?\n/);
  const out: string[] = [];
  const used = new Set<number>();

  for (let i = 0; i < lines.length; i += 1) {
    if (used.has(i)) continue;
    const raw = lines[i].trim();

    // Glued ÷ reduce chain (any numbers): nums "a=b=c" + dens on following lines
    if (/^\d{2,4}(?:\s*=\s*\d{1,4}){1,4}$/.test(raw.replace(/\s/g, ''))) {
      const denBits: string[] = [];
      const denIdxs: number[] = [];
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j += 1) {
        const t = lines[j].trim();
        if (/^\d{1,6}$/.test(t) || /^\d{2,4}(?:\s+\d{1,4})+$/.test(t)) {
          denBits.push(t);
          denIdxs.push(j);
          continue;
        }
        if (denBits.length) break;
        if (/^[a-z]/i.test(t)) break;
      }
      const denLine = denBits.join(' ');
      const chain = denLine ? reconstructGluedDivFractionChain(raw, denLine) : null;
      if (chain) {
        out.push(chain);
        for (const u of denIdxs) used.add(u);
        continue;
      }
    }

    // Two-step glued dens on one token (any numbers)
    if (/^\d{3,4}=\d{1,2}$/.test(raw.replace(/\s/g, ''))) {
      const next = lines[i + 1]?.trim() ?? '';
      if (/^\d{4,6}$/.test(next)) {
        const chain = reconstructGluedDivFractionChain(raw, next);
        if (chain) {
          out.push(chain);
          used.add(i + 1);
          continue;
        }
      }
    }

    // Normalize spacing on already-recognized mixed sums (no invented digits)
    const mixedSlash = raw.match(
      /^(\d{1,2})\s+(\d{1,2})\s*\/\s*(\d{1,2})\s*[+\uFF0B]\s*(\d{1,2})\s+(\d{1,2})\s*\/\s*(\d{1,2})$/,
    );
    if (mixedSlash) {
      out.push(
        `${formatMixedNumber(mixedSlash[1], mixedSlash[2], mixedSlash[3])} + ${formatMixedNumber(mixedSlash[4], mixedSlash[5], mixedSlash[6])}`,
      );
      continue;
    }

    out.push(lines[i]);
  }

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
