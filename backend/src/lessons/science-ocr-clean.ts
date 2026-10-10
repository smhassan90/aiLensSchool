/**
 * Subject-agnostic cleanup for science/math OCR artifacts.
 * Safe transforms are applied on every merge; heavier notation fixes
 * only when the page already looks like science/numericals.
 */

const STEM_ACRONYM_KEEP =
  /^(?:THE|AND|FOR|SHM|RMS|LHS|RHS|DNA|OCR|USB|PDF|HTTP|HTML|CSS|API|CPU|GPU|NASA|WHO|UN|USA|UAE|UK|SI|KE|PE|EMF|AC|DC)$/;

const SCIENCE_PAGE_CUE =
  /\b(?:numericals?|wavelength|frequency|amplitude|pendulum|slinky|ripple\s*tank|ms\^-?1|m\/s|kHz|section\s*\(\s*[a-c]\s*\))\b|ms[™®]|v\s*=\s*f|[λμνπω]/i;

/** Literary pages: skip science-only notation rewrites (safe line cleanups still OK). */
const LITERARY_KEEP_CUE =
  /\b(?:dignity of work|pre-reading|akhtar|rukhsana|uncle inayat|prophet|khandaq|central idea|note for teachers|cobweb|spider|scotland|king bruce)\b/i;

/** Collapse consecutive duplicate numbers: "1300 1300 1300" → "1300". */
export function collapseRepeatedNumericTokens(line: string): string {
  return line.replace(/\b(\d+(?:\.\d+)?)(?:\s+\1){1,}\b/g, '$1');
}

/**
 * Drop OCR junk that looks like confidence / random ALL-CAPS next to %.
 * Does not strip normal "50% of the class" prose.
 */
export function stripConfidenceLikeJunk(line: string): string {
  return line
    .replace(/\b\d{1,3}%\s+[A-Z]{2,8}\b/g, ' ')
    .replace(/\b\d{1,3}%\s+(?=\d)/g, ' ')
    .replace(/\b(?:SRR|SRF)\b/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Handwritten checkmarks often OCR as short junk prefixes before real stems.
 */
export function stripLeadingMarkNoise(line: string): string {
  return line
    .replace(
      /^(?:Ya|ot|ba|UF|EL|hb|Ee|ces)\s+(?=(?:\d+[.)]|What|If|Explain|How|When|Calculate|A\s|The\s|Waves|Suppose|Smmose))/i,
      '',
    )
    .replace(/^Smmose\b/i, 'Suppose')
    .trim();
}

/** Common unit / power-of-ten OCR artifacts from red superscripts. */
export function normalizeScienceNotationArtifacts(text: string): string {
  return text
    // Trademark/registered often stand in for superscript −1 on speed units
    .replace(/ms[\u2122\u00AE™®]!?/gi, 'ms^-1')
    .replace(/m\/s[\u2122\u00AE™®]!?/gi, 'm/s^-1')
    .replace(/m\s*s[\u2122\u00AE™®]!?/gi, 'm s^-1')
    .replace(/\bm\s*s[-]?21\b/gi, 'm s^-2')
    .replace(/\bm\s*s[-]?2\b(?!\d)/gi, 'm s^-2')
    .replace(/\bms[-]?1\b/gi, 'ms^-1')
    .replace(/\b1K\s+the\s+10\s*3\b/gi, '1K = 10^3')
    .replace(/\b(\d)K\s+the\s+10\s*(\d)\b/gi, '$1K = 10^$2')
    .replace(/\bWhere\s+1K\s+the\b/gi, 'Where 1K =')
    .replace(/\b10\s*[³3]\b(?!\d)/g, '10^3')
    .replace(/\b10\s*[⁸8]\b(?!\d)/g, '10^8')
    .replace(/\b(\d+)\s*[x×]\s*10["”']\s*(ms|m\/s)\b/gi, '$1 × 10^8 $2')
    .replace(/\b(\d+)\s*[x×]\s*10\s*([0-9])\b/g, '$1 × 10^$2')
    .replace(/\b(\d+)\s*[x×]\s*10\^([0-9]+)\b/g, '$1 × 10^$2')
    .replace(/\bFrequeney\b/gi, 'Frequency')
    .replace(/\boppositive\b/gi, 'opposite')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function looksLikeScienceNumericalsPage(text: string): boolean {
  const value = (text ?? '').trim();
  if (!value) return false;
  if (SCIENCE_PAGE_CUE.test(value)) return true;
  const answerHits = (value.match(/\(\d+\.?\d*\s*(?:m|s|Hz|ms)/gi) ?? []).length;
  const qHits = (value.match(/^\s*\d+[.)]\s+/gm) ?? []).length;
  return answerHits >= 2 && qHits >= 2;
}

export function isProtectedStemAcronym(token: string): boolean {
  return STEM_ACRONYM_KEEP.test(token.trim());
}

/** Line-level cleanup applied after every Paddle+Tess merge. */
export function cleanMergedOcrLine(line: string): string {
  let value = line.trim();
  if (!value) return '';
  value = stripLeadingMarkNoise(value);
  value = collapseRepeatedNumericTokens(value);
  value = stripConfidenceLikeJunk(value);
  return value.replace(/[ \t]{2,}/g, ' ').trim();
}

export function cleanMergedPageOcrText(text: string): string {
  const value = (text ?? '').trim();
  if (!value) return '';
  // Literary English: only collapse obvious digit dupes / confidence junk; never rewrite story prose.
  if (LITERARY_KEEP_CUE.test(value)) {
    return value
      .split(/\r?\n/)
      .map((line) =>
        collapseRepeatedNumericTokens(stripConfidenceLikeJunk(line.trim())),
      )
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  const lines = value.split(/\r?\n/).map(cleanMergedOcrLine);
  let joined = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (looksLikeScienceNumericalsPage(joined)) {
    joined = normalizeScienceNotationArtifacts(joined);
  }
  return joined;
}
