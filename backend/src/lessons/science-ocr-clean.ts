/**
 * Subject-agnostic cleanup for science/math OCR artifacts.
 * Safe transforms are applied on every merge; heavier notation fixes
 * only when the page already looks like science/numericals.
 */

const STEM_ACRONYM_KEEP =
  /^(?:THE|AND|FOR|SHM|RMS|LHS|RHS|DNA|OCR|USB|PDF|HTTP|HTML|CSS|API|CPU|GPU|NASA|WHO|UN|USA|UAE|UK|SI|KE|PE|EMF|AC|DC)$/;

const SCIENCE_PAGE_CUE =
  /\b(?:numericals?|wavelength|frequency|amplitude|pendulum|slinky|ripple\s*tank|ms\^-?1|m\/s|kHz|section\s*\(\s*[a-c]\s*\)|worked\s*example|simple\s*harmonic|transverse|longitudinal|diffraction|refraction|concept\s*map|self[- ]?assessment|summary|angular\s*displacement|restoring\s*force|square\s*root|infty|infinity)\b|ms[™®]|v\s*=\s*f|T\s*=\s*2|sin\s*(?:θ|the?ta)|cos\s*(?:θ|the?ta)|a\s*∝|[λμνπωθπ√∞≅≈]/i;

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
 * OCR often drops Greek λ (wavelength) or reads it as latin x/l.
 * Restore from textbook phrasing — only when wave/wavelength cues exist.
 */
export function restoreWavelengthLambdaSymbols(text: string): string {
  const value = (text ?? '').trim();
  if (!value) return value;
  const waveContext =
    /\b(?:wavelength|consecutive crests|ripple\s*tank|0\.125\s*Hz|wave\s*speed|general wave)\b/i.test(
      value,
    ) || /\bv\s*=\s*f/i.test(value);
  if (!waveContext) return value;

  return value
    // "iv. is the distance between the two consecutive crests" → insert λ
    .replace(
      /(^|\n)(\s*(?:iv|IV)[.)]?\s*)is the distance between the two consecutive crests/gim,
      '$1$2λ is the distance between the two consecutive crests',
    )
    // "iv. = 8.0 m" or "iv.\n=8.0m" → λ =
    .replace(
      /(^|\n)\s*(?:iv|IV)[.)]?\s*=\s*(\d+\.?\d*\s*m\.?)/gim,
      '$1λ = $2',
    )
    .replace(
      /(^|\n)\s*(?:iv|IV)[.)]?\s*\n\s*=\s*(\d+\.?\d*\s*m\.?)/gim,
      '$1λ = $2',
    )
    // Compact OCR: b.v=fx  /  v=fx  /  v = f x  /  v=f× / bare b.v=f (missing λ)
    .replace(/\bb\.?\s*v\s*=\s*f\s*x\b/gi, 'b. v = f × λ')
    .replace(/\bv\s*=\s*fx\b/gi, 'v = f × λ')
    .replace(/\bv\s*=\s*f\s*[x×*]\s*$/gim, 'v = f × λ')
    .replace(/\bv\s*=\s*f\s*[x×*]\s*(?=\n|$)/gi, 'v = f × λ')
    .replace(/\bv\s*=\s*f\s*[x×*]\s*[λl]\b/gi, 'v = f × λ')
    .replace(/\bb\.?\s*v\s*=\s*f\s*$/gim, 'b. v = f × λ')
    .replace(/\bb\.?\s*v\s*=\s*f\s*(?=\n)/gi, 'b. v = f × λ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Restore π, θ, √, ∞, ≅, fractions, and frequency symbols common in physics OCR.
 */
export function restorePhysicsMathSymbols(text: string): string {
  const value = (text ?? '').trim();
  if (!value) return value;
  const mathContext =
    SCIENCE_PAGE_CUE.test(value) ||
    /\b(?:sin|cos|tan|theta|theeta|pie|pi\b|sqrt|square\s*root|infty|infinity|22\s*\/\s*7)\b/i.test(
      value,
    );
  if (!mathContext) return value;

  return (
    value
      // --- Angles: sin/cos/tan theta ---
      .replace(/\btheeta\b/gi, 'theta')
      // Diagram OCR often reads θ as trailing e/d/0: mg sine, mg sind, mg sin0, mg cos0
      .replace(/\bmg\s*sin\s*(?:θ|theta|0)\b/gi, 'mg sin θ')
      .replace(/\bmg\s*cos\s*(?:θ|theta|0)\b/gi, 'mg cos θ')
      .replace(/\bmg\s*sin(?:e|d)\b/gi, 'mg sin θ')
      .replace(/\bmg\s*cos(?:e|d)\b/gi, 'mg cos θ')
      .replace(/\bmg\s*sin0\b/gi, 'mg sin θ')
      .replace(/\bmg\s*cos0\b/gi, 'mg cos θ')
      .replace(/\bmg\s*sin\b(?=\s*[=,]|\s*$)/gim, 'mg sin θ')
      .replace(/\bmg\s*cos\b(?=\s*[=,]|\s*$)/gim, 'mg cos θ')
      .replace(/\bsin\s*(?:θ|theta|0)\b/gi, 'sin θ')
      .replace(/\bcos\s*(?:θ|theta|0)\b/gi, 'cos θ')
      .replace(/\btan\s*(?:θ|theta|0)\b/gi, 'tan θ')
      .replace(/\bangular\s*displacement\s*(?:θ|theta|0)\b/gi, 'angular displacement θ')
      .replace(/\bsmall\s*angle\s*['']?(?:θ|theta|0)['']?/gi, "small angle 'θ'")
      // --- Pi (glyph often OCR'd as pie / n / missing entirely) ---
      .replace(/\bpie\s*(?:2|²|\^2)\b/gi, 'π²')
      .replace(/\bpie2\b/gi, 'π²')
      .replace(/\bpi\s*(?:2|²|\^2)\b/gi, 'π²')
      .replace(/\bpie\b/gi, 'π')
      .replace(/\bpi\b/gi, 'π')
      .replace(/π\s*(?:=|≈|~|≅|≠)\s*22\s*\/\s*7/gi, 'π ≅ 22/7')
      .replace(/π\s*(?:=|≈|~|≅)\s*(3\.14\d*)/gi, 'π ≅ $1')
      .replace(/\b(?:approx(?:imately)?|nearly)\s*(?:=\s*)?(22\s*\/\s*7|3\.14\d*)/gi, '≅ $1')
      .replace(/π\s*(?:2|²|\^2)\b/g, 'π²')
      .replace(/π2\b/g, 'π²')
      .replace(/4\s*π\s*(?:2|²|\^2)/g, '4π²')
      .replace(/4π2\b/g, '4π²')
      // Approx / not-equals
      .replace(/!=/g, '≠')
      .replace(/\bnot\s*=\s*/gi, '≠ ')
      .replace(/≠\s*22\s*\/\s*7/gi, '≅ 22/7')
      // --- Square root / period formula ---
      // Live paddle often collapses T=2π√(L/g) to multiline "T=2\nVg"
      .replace(
        /T\s*=\s*2\s*(?:\n+\s*)?(?:π|n|pie|pi)?\s*(?:\n+\s*)?[√vV]\s*(?:\(?\s*[Ll]\s*\/\s*g\s*\)?|g\b)/gi,
        'T = 2π√(L/g)',
      )
      .replace(/T\s*=\s*2\s*(?:π|n|pie|pi)\s*[√vV]\s*\(?\s*[Ll]\s*\/\s*g\s*\)?/gi, 'T = 2π√(L/g)')
      .replace(/T\s*=\s*2\s*(?:π|n)\s+[√vV]\s*\(\s*[Ll]\s*\/\s*g\s*\)/gi, 'T = 2π√(L/g)')
      .replace(
        /(?:formula for its period[;:]?\s*)T\s*=\s*2(?:\s|\n)+V\s*g\b/gi,
        'formula for its period;\nT = 2π√(L/g)',
      )
      .replace(/\bwhole\s*square\s*root\s*(?:of\s*)?/gi, '√')
      .replace(/\bsquare\s*root\s*(?:of\s*)?/gi, '√')
      .replace(/\bsqrt\s*\(/gi, '√(')
      .replace(/√\s*\(\s*[Ll]\s*\/\s*g\s*\)/g, '√(L/g)')
      .replace(/√\s*[Ll]\s*\/\s*g\b/g, '√(L/g)')
      // --- Infinity ---
      .replace(/\b(?:infinity|infty)\b/gi, '∞')
      .replace(/\b8\s*oo\b/gi, '∞')
      // --- Fractions / divide ---
      .replace(/\bA\s*=\s*1\s*\/\s*2\s*\(?\s*(\d)/gi, 'A = 1/2($1')
      .replace(/\bA\s*=\s*1\s*\(\s*(\d)/gi, 'A = 1/2($1')
      .replace(/\bA\s+is\s+the\s+one-half\b/gi, 'A = 1/2')
      .replace(/\b1\s*\/\s*2\b(?!\d)/g, '1/2')
      // Frequency f = 1/T often split across lines: f=1\nT  or  f=1\n8s
      .replace(/\bf\s*=\s*1\s*(?:\n+\s*)+T\b/gi, 'f = 1/T')
      .replace(/\bf\s*=\s*1\s*\/\s*T\b/gi, 'f = 1/T')
      .replace(/\bf\s*=\s*1\s*(?:\n+\s*)+(?:ii\.?\s*(?:\n+\s*)*)?(\d+\.?\d*\s*s)\b/gi, 'f = 1/$1')
      .replace(/\bf\s*=\s*1\s*\/\s*(\d)/gi, 'f = 1/$1')
      // Frequency label often OCR'd without "f"
      .replace(
        /(^|\n)(\s*(?:ii|II)[.)]?\s*)(=\s*0\.125\s*Hz)/gim,
        '$1$2f $3',
      )
      .replace(/(^|\n)(\s*)f\s*\n\s*=\s*/gim, '$1$2f = ')
      .replace(/\bfrequency\s+f\b/gi, 'frequency f')
      .replace(/\ba\.\.?\s*Period and frequency\b/gi, 'a. Period and frequency')
      .replace(/\bii\.?\s*f\s*=\s*\?/gi, 'ii. f = ?')
      .replace(/\bi\.?\s*T\s*=\s*\?/gi, 'i. T = ?')
      // Proportionality
      .replace(/\ba\s*[∞∝xX]\s*-?\s*x\b/gi, 'a ∝ -x')
      .replace(/\ba\s*oc\s*-?\s*x\b/gi, 'a ∝ -x')
      .replace(/\bproportional\s+to\s+-?\s*x\b/gi, '∝ -x')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  );
}

/** Common unit / power-of-ten OCR artifacts from red superscripts. */
export function normalizeScienceNotationArtifacts(text: string): string {
  let value = text
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
    .replace(/\bFig[:.]?\s*(\d+\.\d+)/gi, 'Fig: $1')
    .replace(/\bDo You Know!?\b/gi, 'Do You Know!')
    // Merge sometimes doubles "Step" when "1:" was treated as junk
    .replace(/\bStep\s+Step\s+(?=Write down the known)/gi, 'Step 1: ')
    .replace(/\bStep\s+Step\s+(?=Write down the formula)/gi, 'Step 2: ')
    .replace(/\bStep\s+Step\s+(?=Put the values)/gi, 'Step 3: ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  value = restorePhysicsMathSymbols(value);
  value = restoreWavelengthLambdaSymbols(value);
  return value;
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
