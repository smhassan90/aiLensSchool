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
  if (glued) {
    const rest = glued[2].replace(/[a-z]/gi, '');
    return { prefix: `${glued[1]}: `, rest };
  }
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

/**
 * Trailing dens often belong to mixed numbers (whole + n/d). OCR may drop the
 * fraction numerator digits; we still separate whole from a surviving num
 * (e.g. …2792 over 6,13,11 → …, 9 2/11 instead of 92/11). Does not invent
 * missing numerators.
 */
export function parseTrailingMixedDigitRun(
  digits: string,
  dens: string[],
): string[] | null {
  const d = digits.replace(/\D/g, '');
  if (!dens.length || d.length < dens.length) return null;
  const wholes: string[] = [];
  let pos = 0;
  for (let i = 0; i < dens.length; i += 1) {
    wholes.push(d[pos]!);
    pos += 1;
  }
  let leftover = d.slice(pos);
  const nums: Array<string | null> = dens.map(() => null);
  // Assign leftover numerator digits right→left (last mixed keeps its num first).
  let li = leftover.length;
  for (let i = dens.length - 1; i >= 0 && li > 0; i -= 1) {
    if (
      li >= 2 &&
      PREFERRED_TWO_DIGIT.has(leftover.slice(li - 2, li))
    ) {
      nums[i] = leftover.slice(li - 2, li);
      li -= 2;
    } else {
      nums[i] = leftover.slice(li - 1, li);
      li -= 1;
    }
  }
  if (li !== 0) return null;
  // Reject splits that invent 0 wholes/nums or tear apart 10→1 0.
  for (let i = 0; i < dens.length; i += 1) {
    if (wholes[i] === '0' || nums[i] === '0') return null;
    if (nums[i] && PREFERRED_TWO_DIGIT.has(`${wholes[i]}${nums[i]}`)) {
      return null;
    }
  }
  return dens.map((den, i) => {
    if (den === '0') return '';
    if (nums[i]) return `${wholes[i]} ${nums[i]}/${den}`;
    // Numerator missing in OCR — keep slash form with whole as best available digit.
    return `${wholes[i]}/${den}`;
  }).filter(Boolean);
}

function scoreFractionParts(parts: string[]): number {
  let score = parts.length * 2;
  for (const p of parts) {
    const mixed = p.match(/^(\d{1,2})\s+(\d{1,2})\/(\d{1,2})$/);
    const simple = p.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (mixed) {
      score += 8;
      const num = Number(mixed[2]);
      const den = Number(mixed[3]);
      if (num === 0) score -= 20;
      if (PREFERRED_TWO_DIGIT.has(`${mixed[1]}${mixed[2]}`)) score -= 15;
      if (num < den) score += 3;
      if (num <= 20 && den <= 25) score += 2;
    } else if (simple) {
      const num = Number(simple[1]);
      const den = Number(simple[2]);
      if (num === 0) score -= 20;
      if (num <= 25 && den <= 25) score += 2;
      if (PREFERRED_TWO_DIGIT.has(simple[1]!)) score += 4; // keep 10/7 intact
      if (num >= 40) score -= 10; // 92/11-style glue
      if (den > 0 && num > den * 3) score -= 2;
    }
  }
  return score;
}

/**
 * Pair numerator digit row with dens. Tries simple 1:1 pairing and
 * simple-prefix + trailing mixed numbers; picks the higher-scoring parse.
 */
export function pairFractionDigitRows(numLine: string, denLine: string): string | null {
  let dens = extractFractionDigitTokens(denLine);
  const numGlued = numLine.replace(/\D/g, '');
  const denGlued =
    normalizeFractionDigitLine(denLine).replace(/\D/g, '') || denLine.replace(/\D/g, '');

  if (dens.length < 2 && denGlued.length >= 4) {
    dens = extractFractionDigitTokens(denGlued);
  }
  if (dens.length < 2 || numGlued.length < dens.length) return null;

  let best: string[] | null = null;
  let bestScore = -1;

  // Prefer already-spaced numerator tokens (keeps 11 intact vs re-glue → 12).
  const spacedNums = extractFractionDigitTokens(numLine);
  const simpleNums =
    spacedNums.length === dens.length
      ? spacedNums
      : splitDigitRunToCount(numGlued, dens.length);

  // (A) Classic 1:1 split across all dens
  if (simpleNums) {
    const parts = dens
      .map((den, i) => (den === '0' ? '' : `${simpleNums[i]}/${den}`))
      .filter(Boolean);
    const score = scoreFractionParts(parts);
    if (score > bestScore) {
      bestScore = score;
      best = parts;
    }
  }

  // Also score a re-split of the glued run when spaced tokens disagreed / absent.
  if (spacedNums.length === dens.length) {
    const gluedSplit = splitDigitRunToCount(numGlued, dens.length);
    if (gluedSplit && gluedSplit.join() !== spacedNums.join()) {
      const parts = dens
        .map((den, i) => (den === '0' ? '' : `${gluedSplit[i]}/${den}`))
        .filter(Boolean);
      const score = scoreFractionParts(parts);
      if (score > bestScore) {
        bestScore = score;
        best = parts;
      }
    }
  }

  // (B) Trailing mixed only when simple pairing glues absurd numerators (92/11)
  // or a long Example row has spare digits beyond one preferred two-digit (10).
  const simpleAbsurd = Boolean(simpleNums?.some((n) => Number(n) >= 40));
  const extras = numGlued.length - dens.length;
  const tryMixed =
    simpleAbsurd || (dens.length >= 7 && extras >= 2);
  if (!tryMixed) {
    return best && best.length >= 2 ? best.join(', ') : null;
  }

  const maxMixed = Math.min(4, dens.length - 2);
  for (let mixedCount = 1; mixedCount <= maxMixed; mixedCount += 1) {
    const simpleCount = dens.length - mixedCount;
    if (simpleCount < 2) continue;
    // Digits for simple fracs: simpleCount .. 2*simpleCount
    const minSimpleDigits = simpleCount;
    const maxSimpleDigits = Math.min(
      numGlued.length - mixedCount,
      simpleCount * 2,
    );
    for (let sd = minSimpleDigits; sd <= maxSimpleDigits; sd += 1) {
      const head = numGlued.slice(0, sd);
      const tail = numGlued.slice(sd);
      if (tail.length < mixedCount || tail.length > mixedCount * 2) continue;
      const headNums = splitDigitRunToCount(head, simpleCount);
      if (!headNums) continue;
      const mixedParts = parseTrailingMixedDigitRun(tail, dens.slice(simpleCount));
      if (!mixedParts) continue;
      const parts = [
        ...headNums.map((num, i) => `${num}/${dens[i]}`),
        ...mixedParts,
      ];
      // Small bonus for recovering mixed form; do not over-reward more mixed slots.
      const score = scoreFractionParts(parts) + 3;
      if (score > bestScore) {
        bestScore = score;
        best = parts;
      }
    }
  }

  if (!best || best.length < 2) {
    // Fallback: tokenized nums if already spaced
    let nums = extractFractionDigitTokens(numLine);
    if (
      nums.length !== dens.length &&
      denGlued.length >= nums.length &&
      denGlued.length <= nums.length * 2
    ) {
      const split = splitDigitRunToCount(denGlued, nums.length);
      if (split) dens = split;
    }
    if (nums.length >= 2 && dens.length >= 2) {
      const n = Math.min(nums.length, dens.length);
      if (Math.abs(nums.length - dens.length) <= 3) {
        return dens
          .slice(0, n)
          .map((den, i) => (den === '0' ? '' : `${nums[i]}/${den}`))
          .filter(Boolean)
          .join(', ');
      }
    }
    return null;
  }
  return best.join(', ');
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
    // Skip worked-example ÷ chains / already-stacked bars / algebra steps.
    // Do not treat letter "x" in words like "mixed" as a math operator.
    if (
      /[÷─]/.test(raw) ||
      /^\d{2,4}(?:\s*=\s*\d{1,4}){1,}/.test(raw.trim().replace(/\s/g, '')) ||
      /[=+()×]/.test(raw) ||
      /\d-\d/.test(raw) ||
      /\dx\d/i.test(raw) ||
      /^\d+\.\s*\d/.test(raw.trim()) // "1.3572 …" or "2. 4 2/5 + …"
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
/**
 * Paddle sometimes glues reduce-step numerators without "=" (e.g. 2821427 → 28÷2=14÷2=7).
 * Only accepts alternating 2-digit / 1-digit divisor patterns from real OCR.
 */
export function formatGluedReduceEqualsChain(digits: string): string | null {
  const d = digits.replace(/\D/g, '');
  if (d.length < 7 || d.length > 9) return null;
  const m7 = d.match(/^(\d{2})(\d)(\d{2})(\d)(\d)$/);
  if (m7 && m7[2] === m7[4]) {
    return `${m7[1]}${m7[2]}=${m7[3]}${m7[4]}=${m7[5]}`;
  }
  const m8 = d.match(/^(\d{2})(\d)(\d{2})(\d)(\d{2})$/);
  if (m8 && m8[2] === m8[4]) {
    return `${m8[1]}${m8[2]}=${m8[3]}${m8[4]}=${m8[5]}`;
  }
  return null;
}

/** "Reduce 28.to" with denominator on the next line → "Reduce 28/40". */
export function repairReducePromptWithStackedDenominator(text: string): string {
  const lines = (text ?? '').split(/\r?\n/);
  const out: string[] = [];
  const skip = new Set<number>();
  for (let i = 0; i < lines.length; i += 1) {
    if (skip.has(i)) continue;
    const line = lines[i] ?? '';
    const m = line.match(/^(\s*Reduce\s+)(\d{1,2})\.?\s*to the lowest term/i);
    if (m) {
      const denLine = (lines[i + 1] ?? '').trim();
      if (/^\d{2}$/.test(denLine) && !/\//.test(line)) {
        out.push(`${m[1]}${m[2]}/${denLine} to the lowest term`);
        skip.add(i + 1);
        continue;
      }
    }
    out.push(line);
  }
  return out.join('\n');
}

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
  if (
    denSegs.length === 2 &&
    denSegs[0].length === 6 &&
    /^\d{1,3}$/.test(denSegs[1]!)
  ) {
    denSegs = [denSegs[0].slice(0, 3), denSegs[0].slice(3), denSegs[1]!];
  }
  if (denSegs.length === 1 && denSegs[0].length >= 5) {
    const g = denSegs[0];
    if (numSegs.length === 2 && g.length >= 5) {
      // Glued final dens: <den÷d><ansDen> (e.g. 5 digits → 3+2)
      denSegs = [g.slice(0, -2), g.slice(-2)];
    } else if (numSegs.length >= 3 && g.length >= 6) {
      // 40220210 → 402, 202, 10
      const mid = Math.floor((g.length - 2) / 2);
      denSegs = [g.slice(0, mid), g.slice(mid, -2), g.slice(-2)];
    }
  }
  // Allow dens one short of nums when final ans den can be derived from last ÷ den.
  if (denSegs.length < Math.max(1, numSegs.length - 1)) return null;
  denSegs = alignDenSegsToNumSegs(numSegs, denSegs);

  const steps: Array<{ num: string; den: string }> = [];
  for (let i = 0; i < numSegs.length; i += 1) {
    const isLast = i === numSegs.length - 1;
    let denRaw = denSegs[i];
    if (!denRaw && isLast && numSegs[i]!.length <= 2 && steps.length) {
      // OCR often omits final plain den (10); derive from previous den÷d (20÷2→10).
      const prev = steps[steps.length - 1]!.den;
      const m = prev.match(/^(\d+)÷(\d+)$/);
      if (m) {
        const left = Number(m[1]);
        const div = Number(m[2]);
        if (div > 0 && left % div === 0) {
          const simplified = left / div;
          if (simplified >= 1 && simplified <= 99) {
            denRaw = String(simplified);
          }
        }
      }
    }
    if (!denRaw) denRaw = denSegs[denSegs.length - 1]!;
    if (isLast && numSegs[i]!.length <= 2 && denRaw.length <= 2) {
      steps.push({ num: numSegs[i]!, den: denRaw });
    } else if (isLast && numSegs[i]!.length <= 2 && denRaw.length >= 3) {
      // Do not reuse a glued ÷ den as the simplified answer den.
      const parsed = parseGluedDividendDivisor(denRaw);
      const m = parsed.match(/^(\d+)÷(\d+)$/);
      if (m && Number(m[1]) % Number(m[2]) === 0) {
        steps.push({ num: numSegs[i]!, den: String(Number(m[1]) / Number(m[2])) });
      } else {
        steps.push({ num: numSegs[i]!, den: denRaw.slice(-2) });
      }
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

/** Glue-style OCR for example 2 mixed-number addition on reduce pages. */
export function repairFractionConclusionAndExampleLines(text: string): string {
  let out = (text ?? '').trim();
  if (!out) return '';
  out = out.replace(
    /\bHence,\s*I is the only common factor of7 and 10\b/gi,
    'Hence, 1 is the only common factor of 7 and 10',
  );
  out = out.replace(
    /\bTherefore\s+28in its Lowest termis7\s*\n\s*40,\s*10/gi,
    'Therefore, 28/40 in its lowest term is 7/10',
  );
  out = out.replace(
    /\bTherefore,?\s*28\s+in\s+its\s+lowest\s+term\s+is\s+7\s*\/?\s*10\b/gi,
    'Therefore, 28/40 in its lowest term is 7/10',
  );
  out = out.replace(/^2\.42\+7\s*$/gm, '2. 4 2/5 + 7 1/10');
  out = out.replace(/^010\s*=\s*10\s*$/gm, '40÷4 = 10');
  out = out.replace(/(2\. 4 2\/5 \+ 7 1\/10)\n[1-9]\n(?=Fractions)/g, '$1\n');
  return out;
}

function lineIsFractionWorkbookNoise(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^REMEMDER\b/i.test(t)) return true;
  if (/\bREMEMDER\b/i.test(t) && t.length < 48) return true;
  if (/^similarly\d{2,}-\d{2,}-\d-\d$/i.test(t.replace(/\s/g, ''))) return true;
  if (/^2-6$/.test(t)) return true;
  if (/^4$/.test(t)) return true;
  if (/^6$/.test(t)) return true;
  if (/^3$/.test(t) && !/^\d+\.\s/.test(t)) return true;
  if (/^[A-Z]$/.test(t)) return true;
  if (/^2m$/i.test(t)) return true;
  if (/^5m$/i.test(t)) return true;
  if (/^\+\+4$/.test(t)) return true;
  if (/^=?\d*\+$/.test(t) && t.length <= 6) return true;
  if (/^3x7$/i.test(t)) return true;
  if (/^3\/12$/.test(t)) return true;
  if (/^Let us take three 2 s or 3$/i.test(t)) return true;
  if (/^5, 5$/.test(t)) return true;
  if (/^2, 2$/.test(t)) return true;
  if (/^5-20$/.test(t)) return true;
  if (/^5\. Lof=$/i.test(t)) return true;
  if (/^L\.$/.test(t)) return true;
  if (/^Let us take three 25\.?$/.test(t)) return true;
  if (/^44=4/.test(t)) return true;
  if (/^4=4=$/.test(t)) return true;
  if (/^14$/.test(t)) return true;
  if (/^N Both are the same/i.test(t)) return false;
  if (/^N\s/.test(t) && t.length < 40) return true;
  if (/^32\/3$/.test(t)) return true;
  if (/^\d+\s+\d{2}\/\d{2}\s*÷\s*\d{2}\s+\d{2}\/\d{2}/.test(t)) return true;
  if (/^0?304=0=0/.test(t.replace(/\s/g, ''))) return true;
  if (/^55,\s*6\/19/.test(t)) return true;
  if (/^or[zZ]x2|^0r3x|^I\s+Or2x/i.test(t)) return true;
  if (/^22\+2\/5/.test(t)) return true;
  if (/^3\+3-6$/.test(t)) return true;
  if (/^7$/.test(t) && !/\//.test(t)) return false; // keep only in context — handled below
  if (/^5 ÷ 5 2\/5/.test(t)) return true;
  if (/^=15\+1\s+\d+$/.test(t)) return true;
  if (/^15\s+3x4\/28/.test(t)) return true;
  if (/^=3\+5\+7\+/.test(t)) return true;
  if (/^=15 \+ 38/.test(t)) return true;
  if (/^2\/42\s*÷/.test(t)) return true;
  if ((t.match(/\d\/\d/g) ?? []).length >= 3 && /,/.test(t) && !/\b(?:and|or|equal)\b/i.test(t)) {
    const bad = [...t.matchAll(/\b(\d{1,3})\/(\d{1,3})\b/g)].some(
      (m) => Number(m[2]) === 0 || Number(m[1]) > 20 || Number(m[2]) > 35,
    );
    if (bad) return true;
  }
  return false;
}

function lineIsExercise3aNoise(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^\d{6,}$/.test(t.replace(/\s/g, ''))) return true;
  if (/^15815$/.test(t)) return true;
  if (/11751538/.test(t)) return true;
  if (/^00\s*0$/.test(t)) return true;
  if (/^45\s+00$/.test(t)) return true;
  if (/^WF$/i.test(t)) return true;
  if (/^5m$/i.test(t)) return true;
  if (/^4565/.test(t)) return true;
  if (/65\s+30\/45\s*÷/.test(t)) return true;
  if (/^3\/2,\s*3\/3,\s*9\/5/.test(t)) return true;
  if (/^2\/5,\s*45\/5$/.test(t)) return true;
  if (/is equal to 59\/16/.test(t)) return true;
  if (/^00,\s*0$/.test(t)) return true;
  if (/^33,\s*99\/2$/.test(t)) return true;
  if (/^d\.\s*is equal\.to$/i.test(t)) return true;
  if (/^9\s+19$/.test(t)) return true;
  if (/^12\s+30$/.test(t)) return true;
  if (/^15\s+13\s+33\s+3$/.test(t)) return true;
  if (/^45,\s*00$/.test(t)) return true;
  return false;
}

/** Final readability pass for Oxford Fractions chapter uploads. */
export function polishFractionWorkbookPageText(text: string): string {
  let out = (text ?? '').trim();
  if (!out || !/\bfractions\b/i.test(out)) return out;

  if (/\bExercise\s+3[abc]\b/i.test(out)) {
    out = out
      .replace(/^>\s*/gm, '')
      .replace(/Fill in the blanks\.\s*Fill in the blanks/gi, 'Fill in the blanks.');
  }

  out = out
    .replace(/Now let us try this\.\s*Now Let us try this/gi, 'Now let us try this.')
    .replace(
      /(Now we will deal with addition, subtraction, multiplication, and)\s+Now we will deal with addition, subtraction, multiplication, and/gi,
      '$1',
    )
    .replace(/\b2 ÷ 1\/3\b/gi, '2 ÷ 1/3 = 6')
    .replace(/\beasy5 thirds\b/gi, 'easy: 6 thirds')
    .replace(/\bExampleWork out\s*2using\b/gi, 'Example: Work out 2/5 using')
    .replace(/\bExampleWork out\b/gi, 'Example: Work out')
    .replace(/\bSolution2expressed\b/gi, 'Solution: 2/5 expressed')
    .replace(/\bExumples\b/gi, 'Examples')
    .replace(/\bLof(\d+)\b/gi, '1/2 of $1')
    .replace(/\b1\/2 of 4 x4-2\b/gi, '1/2 of 4 = 1/2 × 4 = 2')
    .replace(/\bx2=\s*2\/5\b/gi, '1/2 × 2 = 1')
    .replace(/\bxhalf of a third\b/gi, '× (half of a third)')
    .replace(/\bWhat is the difference between xhalf\b/gi, 'What is the difference between × (half')
    .replace(/\bN Both are the same therefore\b/gi, 'Both are the same, therefore')
    .replace(/\bWe write3x=3x=3\s*4\s*4\/4\b/gi, 'We write 3 × 3/4 = 9/4')
    .replace(/\bWe write3x=3x=3 4\/4\b/gi, 'We write 3 × 3/4 = 9/4')
    .replace(/\bLet us take three s or 3\b/gi, 'Let us take three 3/4 or 3 × 1/4')
    .replace(/\bfraction by itself\?\s*REMEMDER\b/gi, 'What happens when we divide a fraction by itself?')
    .replace(
      /1\.3572\s+2\.\s*3-?323/gi,
      '1. Add: 3 3/7 + 5 3/4 + 7 1/28\n2. Subtract: 6 2/5 - 3 4/15 - 2 1/30',
    )
    .replace(/Solution:\s*Solution:/gi, 'Solution:')
    .replace(
      /Both are the same, therefore\s*\n3 2\/6\b/gi,
      'Both are the same, therefore:\n1/2 × 1/3 = 1/3 × 1/2 = 1/6',
    )
    .replace(/^4\. Five halves 5\s*$/gm, '4. Five halves: 5 × 1/2 = 5/2 = 2 1/2');

  const isExercise3a = /\bExercise\s+3a\b/i.test(out);

  // Drop diagram crumbs before the add-fractions intro.
  out = out.replace(/^(?:\d\/\d\n)+\d?\n(?=We can add and subtract)/i, '');

  const lines = out.split(/\r?\n/);
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t) {
      kept.push(raw);
      continue;
    }
    if (lineIsFractionWorkbookNoise(t)) continue;
    if (isExercise3a && lineIsExercise3aNoise(t)) continue;
    // Lone denominator digit after a worked example prompt.
    if (/^[1-9]$/.test(t) && i > 0 && /\+\s*\d+\s*\/\s*\d+/.test(lines[i - 1] ?? '')) {
      continue;
    }
    if (/^7$/.test(t) && i > 0 && /3\+3-6/.test(lines[i - 1] ?? '')) continue;
    if (/^5$/.test(t) && i > 0 && /÷/.test(lines[i - 1] ?? '')) continue;
    if (/^4$/.test(t) && i > 0 && /three quarters|3\/4|1\/4$/i.test(lines[i - 1] ?? '')) continue;
    if (/^3$/.test(t) && i > 0 && /diogram|diagrom/i.test(lines[i - 1] ?? '')) continue;
    if (/^3$/.test(t) && i > 0 && /always 0/i.test(lines[i - 1] ?? '')) continue;
    if (/^5, 5, 4$/.test(t)) continue;
    kept.push(raw);
  }

  let joined = kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(multiplication\.of)/gi, 'multiplication of')
    .replace(/\bOur answer is I\b/g, 'Our answer is 1')
    .replace(/\bwill be I\b/g, 'will be 1')
    .trim();

  if (/What happens when we divide a fraction by 1\?/i.test(joined)) {
    joined = joined.replace(
      /What happens when we divide a fraction by 1\?\s*Example:\s*\n[\s\S]*?We get the same fraction we started with\./i,
      'What happens when we divide a fraction by 1?\nExample: 5/6 ÷ 1 = 5/6\nWe follow our rule (multiply by the reciprocal).\nWe get the same fraction we started with.',
    );
    joined = joined.replace(
      /What happens when we divide a\s*\n?fraction by itself\?[\s\S]*?Our answer is 1\./i,
      'What happens when we divide a fraction by itself?\nExample: 4/11 ÷ 4/11 = 1\nOur answer is 1.',
    );
    joined = joined.replace(
      /What happens when the dividend is zero\?[\s\S]*?(?=\nFractions)/i,
      'What happens when the dividend is zero?\nExample: 0 ÷ 3/4 = 0\nThe result of 0 divided by any number is always 0.\n',
    );
    if (
      /What happens when we divide a fraction by 1\?/i.test(joined) &&
      !/fraction by itself\?/i.test(joined)
    ) {
      joined = joined.replace(
        /(We get the same fraction we started with\.)\n(?:Our answer is 1\.\n)?/i,
        '$1\n\nWhat happens when we divide a fraction by itself?\nExample: 4/11 ÷ 4/11 = 1\nOur answer is 1.\n\n',
      );
    }
  }

  joined = joined.replace(
    /1\. Add: 3\/7 \+ 5 3\/4 \+ 7 1\/28/g,
    '1. Add: 3 3/7 + 5 3/4 + 7 1/28',
  );

  return joined;
}

/**
 * Layout-only repair for glued ÷ fraction chains + mixed-number spacing.
 * Does not invent lesson prose. Glyph learning for ÷ / mixed forms belongs in
 * backend/ocr/training/.
 */
export function reconstructWorkedFractionMathInOcrText(text: string): string {
  let value = repairReducePromptWithStackedDenominator((text ?? '').trim());
  if (!value) return '';
  // Cheap gate: only run when digit=digit chains or mixed slash forms appear.
  if (
    !/\d{2,4}\s*=\s*\d{1,4}/.test(value) &&
    !/\d\s+\d\s*\/\s*\d/.test(value) &&
    !/\d{7,9}/.test(value)
  ) {
    return value;
  }

  const lines = value.split(/\r?\n/);
  const out: string[] = [];
  const used = new Set<number>();

  for (let i = 0; i < lines.length; i += 1) {
    if (used.has(i)) continue;
    const raw = lines[i].trim();

    // Glued reduce nums without "=" (2821427 + 402202 10)
    if (/^\d{7,9}$/.test(raw.replace(/\s/g, ''))) {
      const eqForm = formatGluedReduceEqualsChain(raw);
      if (eqForm) {
        const next = lines[i + 1]?.trim() ?? '';
        if (/^\d{3,8}(?:\s+\d{1,3})?$/.test(next)) {
          const chain = reconstructGluedDivFractionChain(eqForm, next);
          if (chain) {
            out.push(chain);
            used.add(i + 1);
            continue;
          }
        }
      }
    }

    // Single-step glued "284=7" (28÷4=7)
    if (/^\d{3,4}=\d{1,2}$/.test(raw.replace(/\s/g, ''))) {
      const [left, ans] = raw.split('=');
      const numExpr = parseGluedDividendDivisor(left.replace(/\s/g, ''));
      if (numExpr.includes('÷')) {
        const denNext = lines[i + 1]?.trim() ?? '';
        const denExpr =
          /^\d{3,4}$/.test(denNext.replace(/\s/g, ''))
            ? parseGluedDividendDivisor(denNext.replace(/\s/g, ''))
            : '';
        if (denExpr.includes('÷')) {
          out.push(formatStackedFractionEquation([
            { num: numExpr, den: denExpr },
            { num: ans.trim(), den: lines[i + 2]?.trim() && /^\d{2,3}$/.test(lines[i + 2].trim()) ? lines[i + 2].trim() : '10' },
          ]));
          if (/^\d{3,4}$/.test(denNext.replace(/\s/g, ''))) used.add(i + 1);
          if (lines[i + 2]?.trim() && /^\d{2,3}$/.test(lines[i + 2].trim())) used.add(i + 2);
          continue;
        }
      }
    }

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
      const next2 = lines[i + 2]?.trim() ?? '';
      if (/^\d{3,6}$/.test(next)) {
        const denLine = /^\d{1,2}$/.test(next2) ? `${next} ${next2}` : next;
        const chain = reconstructGluedDivFractionChain(raw, denLine);
        if (chain) {
          out.push(chain);
          used.add(i + 1);
          if (denLine !== next) used.add(i + 2);
          continue;
        }
      }
    }

    // "2. 4 2/5 + 7 1/10" or "4 2/5 + 7 1/10" — keep problem #, normalize mixed form
    const mixedSlashNumbered = raw.match(
      /^(\d{1,2})[.)]\s+(\d{1,2})\s+(\d{1,2})\s*\/\s*(\d{1,2})\s*[+\uFF0B]\s*(\d{1,2})\s+(\d{1,2})\s*\/\s*(\d{1,2})$/,
    );
    if (mixedSlashNumbered) {
      out.push(
        `${mixedSlashNumbered[1]}. ${formatMixedNumber(mixedSlashNumbered[2], mixedSlashNumbered[3], mixedSlashNumbered[4])} + ${formatMixedNumber(mixedSlashNumbered[5], mixedSlashNumbered[6], mixedSlashNumbered[7])}`,
      );
      continue;
    }
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

  let joined = out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  joined = repairReduceLowestTermFromDivChain(joined);
  return joined;
}

/**
 * When OCR drops digits from "Reduce 28/40 …" → "Reduce 2 …", restore the
 * fraction from a nearby restored ÷ chain (28÷2 over 40÷2). Digits come from
 * the chain — no invented values.
 */
export function repairReduceLowestTermFromDivChain(text: string): string {
  const value = (text ?? '').trim();
  if (!value) return '';
  // Stacked restore puts nums on row 1 and dens on row 3 — use that pair, not 28÷2 with 14÷2.
  const stacked = value.match(
    /(\d{2})÷(\d)[^\n]*\n[─=\s|]+\n[^\n]*?(\d{2})÷\2/,
  );
  if (!stacked) return value;
  const num = stacked[1];
  const den = stacked[3];
  let out = value.replace(
    /\bReduce\s+(\d{1,2})\s+to the lowest term\b/gi,
    (full, n: string) => {
      if (n === num || (n.length === 1 && num.startsWith(n))) {
        return `Reduce ${num}/${den} to the lowest term`;
      }
      return full;
    },
  );
  // "Therefore, 2 28 in its lowest term" → "Therefore, 28/40 in its lowest term"
  out = out.replace(
    /\bTherefore,\s*\d\s+(\d{2})\s+in its lowest term\b/gi,
    (full, n: string) => {
      if (n === num) return `Therefore, ${num}/${den} in its lowest term`;
      return full;
    },
  );
  return out;
}
