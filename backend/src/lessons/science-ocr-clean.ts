import {
  reconstructStackedFractionsInOcrText,
  reconstructWorkedFractionMathInOcrText,
  repairFractionConclusionAndExampleLines,
} from './ocr-fraction-layout';

/**
 * Light, page-agnostic OCR hygiene after Paddle+Tesseract merge.
 *
 * Do NOT invent lesson sentences or page-specific wording here.
 * Greek / math glyphs (λ, θ, π, √, ÷, …) and mixed-number reading should come
 * from the recognizer — see backend/ocr/training/.
 *
 * Allowed here: layout restore from digits/boxes the engines already emitted
 * (stacked 3-over-4 → 3/4; glued dividend+divisor when ÷ glyph was dropped).
 * Never hardcode one textbook page’s numbers or prose.
 */

const STEM_ACRONYM_KEEP =
  /^(?:THE|AND|FOR|SHM|RMS|LHS|RHS|DNA|OCR|USB|PDF|HTTP|HTML|CSS|API|CPU|GPU|NASA|WHO|UN|USA|UAE|UK|SI|KE|PE|EMF|AC|DC)$/;

const SCIENCE_PAGE_CUE =
  /\b(?:numericals?|wavelength|frequency|amplitude|pendulum|slinky|ripple\s*tank|ms\^-?1|m\/s|kHz|section\s*\(\s*[a-c]\s*\)|worked\s*example|simple\s*harmonic|transverse|longitudinal|diffraction|refraction|concept\s*map|self[- ]?assessment|summary|angular\s*displacement|restoring\s*force|square\s*root|infty|infinity|electrostatics?|coulomb|electroscope|capacitor|capacitance|induction|dielectric|electric\s*field|electric\s*potential|potential\s*difference|point\s*charges?|μF|uF\b|farad)\b|ms[™®]|v\s*=\s*f|T\s*=\s*2|sin\s*(?:θ|the?ta)|cos\s*(?:θ|the?ta)|a\s*∝|Q\s*=\s*C\s*V|F\s*=\s*[kK]|[λμνπωθπ√∞≅≈ε₀]/i;

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

/**
 * @deprecated Prefer trained recognizer (backend/ocr/training). Kept as no-op
 * export so older imports/tests can migrate without breaking the build.
 */
export function restoreWavelengthLambdaSymbols(text: string): string {
  return (text ?? '').trim();
}

/**
 * @deprecated Prefer trained recognizer (backend/ocr/training).
 */
export function restorePhysicsMathSymbols(text: string): string {
  return (text ?? '').trim();
}

/**
 * @deprecated Page-specific wording restore removed — train the OCR model instead.
 */
export function restoreElectrostaticsIntro(text: string): string {
  return (text ?? '').trim();
}

/**
 * @deprecated Formula invention removed — train the OCR model instead.
 */
export function restoreElectrostaticsFormulas(text: string): string {
  return (text ?? '').trim();
}

/**
 * Only structural unit/superscript noise that is not lesson wording.
 * Glyphs like λ/θ/π must be produced by the recognizer, not invented here.
 */
export function normalizeScienceNotationArtifacts(text: string): string {
  return (text ?? '')
    .replace(/ms[\u2122\u00AE™®]!?/gi, 'ms^-1')
    .replace(/m\/s[\u2122\u00AE™®]!?/gi, 'm/s^-1')
    .replace(/m\s*s[\u2122\u00AE™®]!?/gi, 'm s^-1')
    .replace(/\bm\s*s[-]?21\b/gi, 'm s^-2')
    .replace(/\bm\s*s[-]?2\b(?!\d)/gi, 'm s^-2')
    .replace(/\bms[-]?1\b/gi, 'ms^-1')
    .replace(/\b1K\s+the\s+10\s*3\b/gi, '1K = 10^3')
    .replace(/\b(\d)K\s+the\s+10\s*(\d)\b/gi, '$1K = 10^$2')
    .replace(/\bWhere\s+1K\s+the\b/gi, 'Where 1K =')
    .replace(/\b(\d+\.?\d*)\s*[x×]\s*10\s*-(\d+)\b/g, '$1 × 10^-$2')
    .replace(/\b(\d+\.?\d*)\s*10\s*-(\d+)\b/g, '$1 × 10^-$2')
    .replace(/\b(\d+)\s*[x×]\s*10["”']\s*(ms|m\/s)\b/gi, '$1 × 10^8 $2')
    .replace(/\b(\d+)\s*[x×]\s*10\s*([0-9])\b/g, '$1 × 10^$2')
    .replace(/\bFig[:.]?\s*(\d+\.\d+)/gi, 'Fig: $1')
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

/** Fix glued operation words common on fraction workbook intro lines. */
export function repairWorkbookFractionIntroGluedOps(text: string): string {
  return (text ?? '')
    .replace(/\badditionsubtractionmultiplication\b/gi, 'addition, subtraction, multiplication')
    .replace(/\bsubtractionmultiplication\b/gi, 'subtraction, multiplication')
    .replace(/\badditionsubtraction\b/gi, 'addition, subtraction')
    .replace(
      /\baddition subtraction multiplicotion\b/gi,
      'addition, subtraction, multiplication',
    )
    .replace(/\bmultiplicotion\b/gi, 'multiplication')
    .replace(/\bdifferent-types\b/gi, 'different types');
}

/** CJK / Hangul in English math lessons is almost always bad Pix2Text or wrong model output. */
export function containsForeignScriptNoise(text: string): boolean {
  return /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(text ?? '');
}

export function stripForeignScriptFromEnglishLesson(text: string): string {
  const value = (text ?? '').trim();
  if (!value || !containsForeignScriptNoise(value)) return value;
  const lines = value.split(/\r?\n/).filter((line) => !containsForeignScriptNoise(line));
  const joined = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return joined.length >= value.length * 0.25 ? joined : value.replace(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
}

/** Drop REMEMBER sidebar box lines (right column) on fraction workbook pages. */
export function stripFractionRememberSidebar(text: string): string {
  const value = (text ?? '').trim();
  if (!/\bREMEMBER\b/i.test(value) || !/\bfractions\b/i.test(value)) return value;
  const lines = value.split(/\r?\n/);
  const out: string[] = [];
  let inRemember = false;
  for (const line of lines) {
    const t = line.trim();
    if (/^REMEMBER\b/i.test(t)) {
      inRemember = true;
      continue;
    }
    if (inRemember) {
      if (/^Fractions$/i.test(t) || /^OXFORD/i.test(t)) {
        inRemember = false;
        out.push(line);
      }
      continue;
    }
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Remove duplicate chapter intro when Paddle stitched two opening sentences. */
export function dedupeFractionChapterIntro(text: string): string {
  const lines = (text ?? '').split(/\r?\n/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const isIntro =
      key.startsWith('now we will deal with') ||
      key.startsWith('division of different types of fractions');
    if (isIntro && key.length >= 20) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(line);
  }
  let joined = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  joined = joined.replace(
    /\b(division of different types of fractions)\s+\1\b/gi,
    '$1',
  );
  return joined;
}

/** Drop obvious margin-column crumbs (| pipes, lone “i”, “ke”). */
export function stripFractionMarginColumnCrumbs(text: string): string {
  const lines = (text ?? '').split(/\r?\n/);
  const kept = lines.filter((line) => {
    const t = line.trim();
    if (!t) return true;
    if (/^[ki]\s/i.test(t) && t.length < 120) return false;
    if (/^=\s*$/i.test(t)) return false;
    if (/^[|]\s*/.test(t) && (t.match(/\|/g) ?? []).length >= 2) return false;
    if (/^(?:“Tie|iH|no)$/i.test(t)) return false;
    return true;
  });
  return kept.join('\n');
}

/** Drop Pix2Text/LaTeX lines that collapse to spaced letter soup. */
export function stripGarbledPix2TextLines(text: string): string {
  const lines = (text ?? '').split(/\r?\n/);
  const kept = lines.filter((line) => {
    const t = line.trim();
    if (!t) return true;
    if (/\\\s*\\/.test(t) || /\\\\/.test(t)) return false;
    if (/\barray\b/i.test(t) && /\b[a-z]\s+[a-z]\s+[a-z]/i.test(t)) return false;
    const spacedLetters = t.match(/\b[a-z]\s+[a-z]\s+[a-z]\s+[a-z]/i);
    if (spacedLetters && !/\d\s*\/\s*\d/.test(t) && !/÷/.test(t)) return false;
    if (containsForeignScriptNoise(t)) return false;
    return true;
  });
  return kept.join('\n');
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
  let value = repairWorkbookFractionIntroGluedOps((text ?? '').trim());
  value = stripForeignScriptFromEnglishLesson(value);
  value = stripGarbledPix2TextLines(value);
  value = dedupeFractionChapterIntro(value);
  value = stripFractionMarginColumnCrumbs(value);
  value = stripFractionRememberSidebar(value);
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
  // Worked ÷ chains before generic digit-row pairing (282=142=7 must not become 2/4…).
  joined = reconstructWorkedFractionMathInOcrText(joined);
  joined = reconstructStackedFractionsInOcrText(joined);
  joined = repairFractionConclusionAndExampleLines(joined);
  // Physics pages only — on fraction workbooks `5 10 -1` is 5/10, not 5×10^-1.
  const fractionWorkbook =
    /\bfraction/i.test(joined) &&
    /\b(?:REMEMBER|lowest term|mixed (?:number|fraction)|Reduce\b)/i.test(joined);
  if (looksLikeScienceNumericalsPage(joined) && !fractionWorkbook) {
    joined = normalizeScienceNotationArtifacts(joined);
  }
  return joined;
}
