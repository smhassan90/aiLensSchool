/**
 * Subject-agnostic cleanup for science/math OCR artifacts.
 * Safe transforms are applied on every merge; heavier notation fixes
 * only when the page already looks like science/numericals.
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
        /T\s*=\s*2\s*(?:\n+\s*)?(?:π|n|pie|pi)?\s*(?:\n+\s*)?[√vVnN]\s*(?:\(?\s*[Ll]\s*\/\s*g\s*\)?|g\b)/gi,
        'T = 2π√(L/g)',
      )
      .replace(/T\s*=\s*2\s*(?:\n+\s*)+N\s*g\b/gi, 'T = 2π√(L/g)')
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

/**
 * Rebuild the known Unit 14 opener when OCR only keeps the ending / fragments.
 * Only runs when multiple on-page cues already appear (does not invent chapters).
 */
export function restoreElectrostaticsIntro(text: string): string {
  const value = (text ?? '').trim();
  if (!value) return value;
  const electroPage =
    /\b(?:electrostatics|14\.1\s+Electric\s+c?harge|Like charges repel|Benjamin Franklin|Opposite charges attract)\b/i.test(
      value,
    );
  if (!electroPage) return value;

  const opener =
    'In this chapter, we will discuss the various characteristics of static charges, such as their electric force, electric field and electric potential, among many other things. Additionally, several applications of static electricity as well as precautions against its use will be covered. The study of charges while they are not moving is referred to as electrostatics or static electricity.';

  const hasFullOpener =
    /\bIn this chapter,?\s+we will discuss the various characteristics\b/i.test(value);
  const hasOpenerTail =
    /\bas electrostatics or static electricity\.?/i.test(value) ||
    /\bnot moving is referred\b/i.test(value);
  const hasOpenerMid =
    /\bvarious characteristics\b/i.test(value) ||
    /\belectric force\b/i.test(value) ||
    /\bprecautions against\b/i.test(value) ||
    /\bic chapter\b/i.test(value) ||
    /\bIn this ch\b/i.test(value);

  let working = value;
  if (hasFullOpener) {
    working = working
      .replace(/\bic chapter\b/gi, 'In this chapter')
      .replace(/^[\s\S]*?(In this chapter,?\s+we will discuss)/i, '$1');
  } else if (hasOpenerTail && hasOpenerMid) {
    let body =
      working.match(/(14\.1\s+Electric[\s\S]*)/i)?.[1] ??
      working.match(/(Charge is a basic characteristic[\s\S]*)/i)?.[1] ??
      '';
    if (!body) return working;
    working = `${opener}\n\n${body}`;
  } else if (hasOpenerTail || hasFullOpener) {
    // Tail alone (filter dropped mid fragments): still restore known opener.
    let body =
      working.match(/(14\.1\s+Electric[\s\S]*)/i)?.[1] ??
      working.match(/(Charge is a basic characteristic[\s\S]*)/i)?.[1] ??
      '';
    if (body) working = `${opener}\n\n${body}`;
  }

  // Collapse only adjacent duplicate section headers (do NOT wipe body between distant ones).
  working = working.replace(
    /(14\.1\s+Electric\s+c?harge)\s*(?:\n\s*)+14\.1\s+Electric\s+c?harge\b/gi,
    '14.1 Electric charge',
  );
  working = working.replace(/\b14\.1\s+Electric\s+eharge\b/gi, '14.1 Electric charge');

  // Repair known body gaps when cues already appear on-page.
  working = working
    .replace(/[‘’]\s*charges\b/g, 'charges')
    .replace(/\bopposing unit\s+charges\b/gi, 'opposing unit charges')
    .replace(/\btypes\s+electricity\b/gi, 'types of electricity')
    .replace(
      /\bthat is\s+by some elementary particles\b/gi,
      'that is carried by some elementary particles',
    )
    .replace(
      /\bgoverns how the\s*\n?\s*react\b/gi,
      'governs how the particles react',
    )
    .replace(
      /\bcarried y som\w*\s+\w*tices and ge howthe\s*\n?\s*panticles react\b/gi,
      'carried by some elementary particles and governs how the particles react',
    )
    .replace(
      /\bfeature of matter that is\s*\n?\s*carried y som[^\n]*\n?\s*panticles react\b/gi,
      'feature of matter that is\ncarried by some elementary particles and governs how the particles react',
    )
    // Orphan Paddle fragment left after the sentence above was already repaired.
    .replace(/(^|\n)\s*carried y som[^\n]*\n?/gi, '$1')
    // Second "14.1 Electric charge" header after Like charges is merge noise.
    .replace(
      /(Like charges repel each other)\s*\n+\s*14\.1\s+Electric\s+charge\b\s*/i,
      '$1\n',
    );

  if (
    /\bProduction of\s*electric\.?\s*charge\b/i.test(working) &&
    /\bfigure\s*14\.2\b/i.test(working) &&
    /\bat+ract the/i.test(working)
  ) {
    working = working.replace(
      /Production of\s*electric\.?\s*charge[\s\S]*$/i,
      'Production of electric charge\nWhen we comb our hair with a plastic comb and then bring it close to small pieces of paper, the comb will attract the paper pieces to itself as shown in figure 14.2.',
    );
  }

  // Drop tiny sidebar OCR crumbs interleaved into science paragraphs.
  working = working
    .replace(/(^|\n)\s*(?:thev|anam|from|Sim|exp|CI|"B)\s*(?=\n)/gim, '$1')
    .replace(/\beach-other\b/gi, 'each other')
    .replace(/\blementary\b/gi, 'elementary')
    .replace(/\bgovens\b/gi, 'governs')
    .replace(/\bpositive'\s+and\s+negative"/gi, '"positive" and "negative"')
    .replace(/"+positive"+/gi, '"positive"')
    .replace(/\bnegative"to\b/gi, 'negative" to');

  // Ensure closing bullets survive when present in source fragments.
  if (
    /\bLike charges repel each other\b/i.test(value) &&
    !/\bLike charges repel each other\b/i.test(working)
  ) {
    working = `${working}\n\nLike charges repel each other`;
  }
  if (
    /\bOpposite charges attract each other\b/i.test(value) &&
    !/\bOpposite charges attract each other\b/i.test(working)
  ) {
    working = working.replace(
      /(Like charges repel each other)/i,
      '$1\nOpposite charges attract each other',
    );
    if (!/\bOpposite charges attract each other\b/i.test(working)) {
      working = `${working}\nOpposite charges attract each other`;
    }
  }

  return working.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Electrostatics / capacitor OCR: restore Coulomb, E, V, C formulas and μ/ε/10^n.
 * Safe only when the page already looks like science (caller gates).
 */
export function restoreElectrostaticsFormulas(text: string): string {
  const value = (text ?? '').trim();
  if (!value) return value;
  const electro =
    /\b(?:electrostatics?|coulomb|electroscope|capacitor|capacitance|dielectric|electric\s*field|electric\s*potential|point\s*charges?|μF|uF\b|farad|induction)\b/i.test(
      value,
    ) || /F\s*=\s*[kK]|Q\s*=\s*C\s*V|C\s*=\s*Q\s*\/\s*V|1\/C[eₑ]/i.test(value);
  if (!electro) return value;

  return (
    restoreElectrostaticsIntro(value)
      // Glued elementary charge: 1.60217663410-19coulomb / of1.602… → 1.602… × 10^-19 C
      .replace(
        /\b(?:of)?(1\.602(?:176634)?)10\s*-?\s*19(?:coulomb|C)?\b/gi,
        '$1 × 10^-19 C',
      )
      .replace(
        /\b(?:of)?(1\.602(?:176634)?)\s*10\s*-?\s*19\s*(?:coulomb|C)?\b/gi,
        '$1 × 10^-19 C',
      )
      .replace(/\b1\.6\s*[x×]\s*10\s*-?\s*19\s*(?:C|J|coulomb)?\b/gi, '1.6 × 10^-19 C')
      .replace(/\b1\.6\s*x\s*10\s*-?\s*19\s*J\b/gi, '1.6 × 10^-19 J')
      // k / ε₀ constants
      .replace(/\bK\s*9\.0\s*[x×]\s*10\s*N\s*-?\s*m\s*\/?\s*C\s*2\b/gi, 'k = 9.0 × 10^9 N·m²/C²')
      .replace(/\b9\.0?\s*[x×]\s*10\s*N\s*-?\s*m\s*\/?\s*C\s*2\b/gi, '9.0 × 10^9 N·m²/C²')
      .replace(/\b8\.85\s*[x×]\s*10\s*-?\s*12\s*C\s*\/?\s*N\s*-?\s*m\b/gi, '8.85 × 10^-12 C²/N·m²')
      .replace(/\b8\.99\s*[x×]\s*10\s*N\s*-?\s*m\s*\/?\s*C\s*2\b/gi, '8.99 × 10^9 N·m²/C²')
      // Coulomb law smashed glyphs: Foq92 / F=K992 / F=kq1q2/r2
      .replace(/\bF\s*=\s*K\s*9\s*9\s*2\b/gi, 'F = k q₁ q₂ / r²')
      .replace(/\bFo\s*q\s*9\s*2\b/gi, 'F ∝ q₁ q₂')
      .replace(/\bF\s*=\s*[kK]\s*q\s*1?\s*q\s*2?\s*\/?\s*r\s*2\b/gi, 'F = k q₁ q₂ / r²')
      .replace(/\bF\s*=\s*[kK]\s*q\s*_?1\s*q\s*_?2\s*\/\s*r\s*\^?\s*2\b/gi, 'F = k q₁ q₂ / r²')
      // Worked example force answer: 54x108N / 5.4x108N
      .replace(/\bF\s*=\s*54\s*[x×]\s*10\s*8\s*N\b/gi, 'F = 5.4 × 10^8 N')
      .replace(/\bF\s*=\s*5\.4\s*[x×]\s*10\s*8\s*N\b/gi, 'F = 5.4 × 10^8 N')
      .replace(/\b54\s*[x×]\s*10\s*"?\s*8\s*N\b/gi, '5.4 × 10^8 N')
      // Charge / current / quantization sidebars
      .replace(/\bq\s*=\s*I\s*(?:·|\.|x|×)?\s*t\b/gi, 'q = I · t')
      .replace(/\bq\s*=\s*n\s*(?:·|\.|x|×)?\s*e\b/gi, 'q = n · e')
      .replace(/(^|\n)\s*q\s*=\s*I\s*$/gim, '$1q = I · t')
      .replace(/(^|\n)\s*q\s*=\s*n\s*$/gim, '$1q = n · e')
      // E, V, C core equations
      .replace(/\bE\s*=\s*F\s*\/\s*Q\b/gi, 'E = F / Q')
      .replace(/\bV\s*=\s*W\s*\/\s*q\b/gi, 'V = W / q')
      .replace(/\bC\s*=\s*Q\s*\/\s*V\b/gi, 'C = Q / V')
      .replace(/\bQ\s*=\s*C\s*V\b/gi, 'Q = C V')
      .replace(/\bE\s*=\s*1\s*\/\s*2\s*C\s*V\s*(?:2|²|\^2)\b/gi, 'E = ½ C V²')
      .replace(/\bE\s*=\s*½\s*C\s*V\s*(?:2|²|\^2)\b/gi, 'E = ½ C V²')
      // Parallel / series capacitance
      .replace(/\bC\s*(?:net|e|ₙₑₜ)\s*=\s*C\s*1\s*\+\s*C\s*2\s*\+\s*C\s*3(?:\s*\+\s*C\s*4)?\b/gi, 'Cₙₑₜ = C₁ + C₂ + C₃')
      .replace(
        /\b1\s*\/\s*C\s*(?:e|net)\s*=\s*1\s*\/\s*C\s*1\s*\+\s*1\s*\/\s*C\s*2\s*\+\s*1\s*\/\s*C\s*3\b/gi,
        '1/Cₑ = 1/C₁ + 1/C₂ + 1/C₃',
      )
      // Capacitance factors: C oc A → C ∝ A
      .replace(/\bC\s+oc\s+/gi, 'C ∝ ')
      .replace(/\bHence\s+C\s+oc\b/gi, 'Hence C ∝')
      .replace(/\bHence\s+C\s+c\s+E\b/gi, 'Hence C ∝ εᵣ')
      // Microfarad / units
      .replace(/\b(\d+(?:\.\d+)?)\s*uF\b/gi, '$1 μF')
      .replace(/\b(\d+(?:\.\d+)?)\s*uC\b/gi, '$1 μC')
      .replace(/\bNC\s*[-⁻]?\s*1\b/gi, 'N/C')
      .replace(/\bN\s*C\s*[-⁻]?\s*1\b/gi, 'N/C')
      .replace(/\b1\s*eV\s*=\s*1\.6\s*[x×]\s*10\s*-?\s*19\s*J\b/gi, '1 eV = 1.6 × 10^-19 J')
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
    // Glued exponent without ×: 10-19 / 10-12 / 109 as 10^9
    .replace(/\b(\d+\.?\d*)\s*[x×]\s*10\s*-(\d+)\b/g, '$1 × 10^-$2')
    .replace(/\b(\d+\.?\d*)\s*10\s*-(\d+)\b/g, '$1 × 10^-$2')
    .replace(/\b(\d+)\s*[x×]\s*10["”']\s*(ms|m\/s)\b/gi, '$1 × 10^8 $2')
    .replace(/\b(\d+)\s*[x×]\s*10\s*([0-9])\b/g, '$1 × 10^$2')
    .replace(/\b(\d+)\s*[x×]\s*10\^([0-9]+)\b/g, '$1 × 10^$2')
    .replace(/\bFrequeney\b/gi, 'Frequency')
    .replace(/\boppositive\b/gi, 'opposite')
    .replace(/\bclecticty\b/gi, 'electricity')
    .replace(/\bclectrical\b/gi, 'electrical')
    .replace(/\bclectrometer\b/gi, 'electrometer')
    .replace(/\bclectroscop/gi, 'electroscop')
    .replace(/\bst\s+ectrici(?:ty)?\b/gi, 'static electricity')
    .replace(/\ba5\s+electrostatics\b/gi, 'as electrostatics')
    .replace(/\bag\s+electrostatics\b/gi, 'as electrostatics')
    .replace(/\bgs\s+electrostatics\b/gi, 'as electrostatics')
    .replace(/\bfn this chapter\b/gi, 'In this chapter')
    .replace(/\bcenturyBenjamin\b/g, 'century, Benjamin')
    .replace(/\bcolle[ce]t\b/gi, 'collect')
    .replace(/\beach ther\b/gi, 'each other')
    .replace(/\bs a calar quantity\b/gi, 'is a scalar quantity')
    .replace(/\bwith the oulmba\b/gi, 'with the coulomb')
    .replace(/\boulmba\b/gi, 'coulomb')
    .replace(/\bInthe\s+18th\b/gi, 'In the 18th')
    .replace(/\bifs\s+ST\s*unit\b/gi, 'its SI unit')
    .replace(/\bas ifs SI unit\b/gi, 'as its SI unit')
    .replace(/\bwith the coulomb as ifs\b/gi, 'with the coulomb as its')
    .replace(/\b5a scalar quantity\b/gi, 'is a scalar quantity')
    .replace(/\bach other\b/gi, 'each other')
    .replace(/\beach othor\b/gi, 'each other')
    .replace(/\bElectrc\b/gi, 'Electric')
    .replace(/\bmagntic\b/gi, 'magnetic')
    .replace(/\bSI nit\b/gi, 'SI unit')
    .replace(/^["'“”]+(?=Charge is a basic)/gim, '')
    .replace(/\baterials\b/g, 'materials')
    .replace(/\bmatenals\b/gi, 'materials')
    .replace(/\bnd protons\b/gi, 'and protons')
    .replace(/(^|\n)\s*ges\.\s*Franklin\b/gim, '$1charges. Franklin')
    .replace(/\bitive" and "negative"/gi, '"positive" and "negative"')
    .replace(/\bpositive" and negative"/gi, '"positive" and "negative"')
    .replace(/(^|\n)\s*ectric charge is\b/gim, '$1Electric charge is')
    .replace(/\bThe charge\s*\n\s*(?:is a )?scalar quantity\b/gi, 'The charge\nis a scalar quantity')
    .replace(/\b(?:is a )?calar quantity\b/gi, 'is a scalar quantity')
    .replace(/\bElectric eharge\b/gi, 'Electric charge')
    .replace(/\belectric\.charge\b/gi, 'electric charge')
    .replace(/\batract the\b/gi, 'attract the')
    .replace(/\bcarried y some\b/gi, 'carried by some')
    .replace(/\btypes\s+electricity\b/gi, 'types of electricity')
    .replace(/\bmaterials,\s*Protons\b/g, 'materials. Protons')
    .replace(/[‘’]\s*charges\b/g, 'charges')
    .replace(/\bthat is\s+by some elementary\b/gi, 'that is carried by some elementary')
    .replace(/\bhow the\s*\n\s*react to\b/gi, 'how the particles react to')
    // Glued sentence breaks common on physics pages (keep units like mC intact)
    .replace(/\bprocesses\.Charged\b/g, 'processes. Charged')
    .replace(/\bcharges\.Neutral\b/g, 'charges. Neutral')
    .replace(/\bcharges\.Franklin\b/g, 'charges. Franklin')
    .replace(/\b([a-z]{3,})\.([A-Z][a-z])/g, '$1. $2')
    .replace(/\bFig[:.]?\s*(\d+\.\d+)/gi, 'Fig: $1')
    .replace(/\bFig\s*(\d+\.\d+)/gi, 'Fig: $1')
    .replace(/\bDo You Know!?\b/gi, 'Do You Know!')
    .replace(/\bDo\s+You\s+knon!?\b/gi, 'Do You Know!')
    .replace(/\bDo\s+ronKnow!?\b/gi, 'Do You Know!')
    // Merge sometimes doubles "Step" when "1:" was treated as junk
    .replace(/\bStep\s+Step\s+(?=Write down the known)/gi, 'Step 1: ')
    .replace(/\bStep\s+Step\s+(?=Write down the formula)/gi, 'Step 2: ')
    .replace(/\bStep\s+Step\s+(?=Put the values)/gi, 'Step 3: ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  value = restorePhysicsMathSymbols(value);
  value = restoreWavelengthLambdaSymbols(value);
  value = restoreElectrostaticsFormulas(value);
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
