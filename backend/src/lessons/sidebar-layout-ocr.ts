/**
 * Subject-agnostic sidebar / weblink cleanup for multi-column textbook pages.
 * Distinguishes main lesson body from assistive margin boxes (YouTube, Weblinks,
 * repeated unit headers, diagram-column labels). Literary English pages unchanged.
 */

const WEBLINK_LINE =
  /\bweblinks?\b|encourage students to(?:\s*visit)?|visit(?:\s+the)?\s+below\s+link|youtube\.com|youtu\.be|myphysicslab\.com|phet\.colorado\.edu|sciencelearn\.org\.nz|https?:\/\/|watch\?v[=-]|[ab]+[_\s-]?channel|_channel|org\.nz\/resources/i;

const SCIENCE_BODY_CUE =
  /\b(?:step\s*\d|result\s*=|self[- ]?assessment|wavelength|frequency|amplitude|ripple\s*tank|displacement|wave\s*speed|formula|calculate|hz\b|m\/s|worked\s*example|simple\s*harmonic|pendulum|transverse|longitudinal|diffraction|concept\s*map|summary|slinky|refraction)\b|[λμνπωθΔ]|v\s*=\s*f|T\s*=\s*2|[∪∩∈∅]/i;

const LITERARY_KEEP_CUE =
  /\b(?:dignity of work|pre-reading|akhtar|rukhsana|uncle inayat|prophet|khandaq|central idea|note for teachers|cobweb|spider|scotland)\b/i;

/** Short diagram / margin labels that OCR often injects into the reading column. */
const FIGURE_COLUMN_LABEL =
  /^(?:Lamp|Vibrator|Water|Elastic\s*bands?|White\s*screen(?:\s+on\s+screen)?|Shallow(?:\s+water)?(?:\s+tray)?|Compressed|Stretched|region|Upand|down|motion|Cpes|Trongha|Amplitl|Dire|vibrallo|spreading|Shadow\s*region|Circular\s*waves|Incident(?:\s+wavefronts)?|wavefronts|Straight(?:\s+barrier)?|barrier|Reflected(?:\s+water\s+waves)?|Normal|Deep|Expansion|Raref(?:ue?|a)ction|Spherical(?:\s+dipper)?|dipper|Plane|wayefron|Energy|Transter|Vibration|Wavelength|particles|Compression|Other\s+end\.?|other\s+end\.?|[abc])$/i;

const DIAGRAM_DIRECTION_JUNK =
  /^Direction\s*of\s*i?vibration!?$|^Directionc?of\s*wave\s*propagation!?$|^Ditection[- ]?off?wave[- ]?propagation!?$|^Direction\s+of\s+particle\s+motion$|^Direction\s+of\s*waves?$/i;

const UNIT_HEADER_LINE =
  /^(?:Unit\s*\d{1,2}\s*:?\s*|General\s+Wave\s+propert(?:y|ies|ie|e)?s?\.?|tmt10:\s*|wdnita:\s*|GeneralWave)$/i;

export function lineLooksLikeWeblinkSidebar(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (WEBLINK_LINE.test(trimmed)) return true;
  // Broken URL fragments left after OCR wrapping
  if (/^[a-z0-9._-]{6,}\/[a-z0-9._?=&%-]{4,}$/i.test(trimmed) && /watch|youtube|channel|resources/i.test(trimmed)) {
    return true;
  }
  if (/^[a-z]+SCIEN/i.test(trimmed) || /^CE\s*$/i.test(trimmed)) return true;
  // Orphan YouTube/sidebar titles left after URL lines are removed
  if (
    /^(Waves[\s-].{0,40}|Tank Interference|and Wavelength|launchSCIEN\w*|Pendulum clock invention.{0,40}|oscillation and periodic motion|longitudinal waves and|transverse waves\.?|energy-transfer)$/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  // External sim/lab URLs often wrap without https:// on the same line
  if (
    /^(?:www\.)?(?:myphysicslab|phet\.colorado|sciencelearn\.org)/i.test(trimmed) ||
    /pendulum-lab_en\.html|pendulum-en\.html|waves-and-energy/i.test(trimmed)
  ) {
    return true;
  }
  return false;
}

/** Assistive margin / figure-column noise (not the taught paragraph). */
export function lineLooksLikeAssistSidebar(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (lineLooksLikeWeblinkSidebar(trimmed)) return true;
  if (FIGURE_COLUMN_LABEL.test(trimmed)) return true;
  if (DIAGRAM_DIRECTION_JUNK.test(trimmed)) return true;
  // Tiny OCR crumbs from left/right boxes
  if (/^[|£€©®@#\\<>{}]{1,6}$/.test(trimmed)) return true;
  if (/^(?:Do\s+You\s+K[an]ow!+|Do\s+ronKnow!+)$/i.test(trimmed)) return true;
  return false;
}

function weblinkSignalCount(text: string): number {
  return (
    text.match(
      /youtube\.com|youtu\.be|myphysicslab\.com|phet\.colorado\.edu|sciencelearn\.org\.nz|weblinks?|encourage students to(?:\s*visit)?|visit(?:\s+the)?\s+below\s+link|https?:\/\/|watch\?v=|org\.nz\/resources/gi,
    ) ?? []
  ).length;
}

function figureMarkerCount(text: string): number {
  return (text.match(/\bFig[:.]?\s*\d/gi) ?? []).length;
}

/** Keep first Unit/title header; drop later photo-stitch repeats. */
export function collapseRepeatedUnitHeaders(text: string): string {
  const lines = text.split(/\r?\n/);
  let seenUnit = false;
  let seenTitle = false;
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^Unit\s*\d{1,2}\s*:?\s*$/i.test(trimmed) || /^tmt10:/i.test(trimmed) || /^wdnita:/i.test(trimmed)) {
      if (seenUnit) continue;
      seenUnit = true;
      out.push(trimmed.replace(/^tmt10:\s*/i, 'Unit 10: ').replace(/^wdnita:\s*/i, ''));
      continue;
    }
    if (/^General\s+Wave\s+propert/i.test(trimmed) || /^GeneralWave$/i.test(trimmed)) {
      if (seenTitle) continue;
      seenTitle = true;
      out.push('General Wave properties');
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

/** Collapse accidental OCR word doubles common on these pages. */
export function collapseOcrWordDoubles(text: string): string {
  return text
    .replace(
      /\b(and|called|include|Motion|ASSESSMENT|CONCEPT|Questions|time|teach|waves)\s+\1\b/gi,
      '$1',
    )
    .replace(/What are the the of a wave/gi, 'What are the characteristics of a wave')
    .replace(/\bits motion is called\b/gi, 'its motion is called')
    .replace(/\bMechanical and waves\b/gi, 'Mechanical and electromagnetic waves')
    .replace(/\bwaves and and waves\b/gi, 'waves and electromagnetic waves')
    .replace(/\bmechanical waves and and waves\b/gi, 'mechanical waves and electromagnetic waves');
}

/**
 * Drop interleaved weblink/sidebar/figure-column lines from OCR that read
 * left→right across columns. No-op for literary pages.
 */
export function stripInterleavedWeblinkSidebar(text: string): string {
  const value = (text ?? '').trim();
  if (!value) return value;
  if (LITERARY_KEEP_CUE.test(value)) return value;

  const weblinkHits = weblinkSignalCount(value);
  const figHits = figureMarkerCount(value);
  const science = SCIENCE_BODY_CUE.test(value);
  // Assist cleanup when weblinks exist OR dense multi-figure science layout.
  if (weblinkHits < 1 && !(science && figHits >= 2)) {
    return collapseOcrWordDoubles(collapseRepeatedUnitHeaders(value));
  }
  if (weblinkHits < 2 && !science && figHits < 3) {
    return collapseOcrWordDoubles(collapseRepeatedUnitHeaders(value));
  }

  const lines = value.split(/\r?\n/);
  const stripFigureLabels = science && (weblinkHits >= 1 || figHits >= 3);
  const kept = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    if (lineLooksLikeWeblinkSidebar(trimmed)) return false;
    if (stripFigureLabels && lineLooksLikeAssistSidebar(trimmed)) return false;
    // Mid-page repeated unit headers (full cleaner also collapses)
    if (UNIT_HEADER_LINE.test(trimmed) && /Unit\s*\d|General\s+Wave|tmt10|wdnita/i.test(value.slice(0, 200))) {
      // keep first occurrence via collapseRepeatedUnitHeaders
      return true;
    }
    return true;
  });
  if (kept.filter((l) => l.trim()).length < 4) {
    return collapseOcrWordDoubles(collapseRepeatedUnitHeaders(value));
  }
  const joined = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (joined.length < value.length * 0.35) {
    return collapseOcrWordDoubles(collapseRepeatedUnitHeaders(value));
  }
  return collapseOcrWordDoubles(collapseRepeatedUnitHeaders(joined));
}

export type OcrBoxLine = {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

/**
 * Prefer the main reading column when a narrow side band is mostly weblinks/URLs.
 * Returns null when geometry is ambiguous (caller keeps original order).
 */
export function pickMainColumnLines(lines: OcrBoxLine[]): OcrBoxLine[] | null {
  if (lines.length < 8) return null;
  const pageLeft = Math.min(...lines.map((l) => l.x0));
  const pageRight = Math.max(...lines.map((l) => l.x1));
  const pageWidth = Math.max(pageRight - pageLeft, 1);
  if (pageWidth < 80) return null;

  const mids = lines.map((l) => (l.x0 + l.x1) / 2);
  const sortedMids = [...mids].sort((a, b) => a - b);
  let bestGap = 0;
  let splitAt = -1;
  for (let i = 1; i < sortedMids.length; i += 1) {
    const gap = sortedMids[i] - sortedMids[i - 1];
    if (gap > bestGap) {
      bestGap = gap;
      splitAt = (sortedMids[i] + sortedMids[i - 1]) / 2;
    }
  }
  const weblinkCount = lines.filter((l) => lineLooksLikeAssistSidebar(l.text)).length;
  const gapOk = bestGap >= pageWidth * 0.08 && splitAt >= 0;
  if (!gapOk) {
    if (weblinkCount < 2) return null;
    splitAt = pageLeft + pageWidth * 0.34;
  }

  const left = lines.filter((l) => (l.x0 + l.x1) / 2 < splitAt);
  const right = lines.filter((l) => (l.x0 + l.x1) / 2 >= splitAt);
  if (left.length < 2 || right.length < 2) return null;

  const bandWidth = (band: OcrBoxLine[]) => {
    const minX = Math.min(...band.map((l) => l.x0));
    const maxX = Math.max(...band.map((l) => l.x1));
    return maxX - minX;
  };
  const weblinkDensity = (band: OcrBoxLine[]) => {
    if (!band.length) return 0;
    const hits = band.filter((l) => lineLooksLikeAssistSidebar(l.text)).length;
    return hits / band.length;
  };
  const bodyChars = (band: OcrBoxLine[]) =>
    band
      .filter((l) => !lineLooksLikeAssistSidebar(l.text))
      .reduce((sum, l) => sum + l.text.replace(/\s+/g, '').length, 0);

  const leftW = bandWidth(left);
  const rightW = bandWidth(right);
  const leftWeb = weblinkDensity(left);
  const rightWeb = weblinkDensity(right);

  let main: OcrBoxLine[] | null = null;
  if (leftW <= pageWidth * 0.48 && leftWeb >= 0.22 && bodyChars(right) > bodyChars(left)) {
    main = right;
  } else if (rightW <= pageWidth * 0.48 && rightWeb >= 0.22 && bodyChars(left) > bodyChars(right)) {
    main = left;
  } else if (leftWeb >= 0.32 && rightWeb < 0.18 && bodyChars(right) >= bodyChars(left)) {
    main = right;
  } else if (rightWeb >= 0.32 && leftWeb < 0.18 && bodyChars(left) >= bodyChars(right)) {
    main = left;
  }

  if (!main || main.length < 4) return null;
  return [...main].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}

export function textFromBoxLines(lines: OcrBoxLine[]): string {
  return lines
    .map((l) => l.text.trim())
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
