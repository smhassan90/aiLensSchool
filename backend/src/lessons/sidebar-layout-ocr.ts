/**
 * Subject-agnostic sidebar / weblink cleanup for multi-column textbook pages.
 * Gated so single-column English/Urdu literary pages are unchanged.
 */

const WEBLINK_LINE =
  /\bweblinks?\b|encourage students to(?:\s*visit)?|visit below link|youtube\.com|youtu\.be|https?:\/\/|watch\?v[=-]|[ab]+[_\s-]?channel|_channel/i;

const SCIENCE_BODY_CUE =
  /\b(?:step\s*\d|result\s*=|self[- ]?assessment|wavelength|frequency|amplitude|ripple\s*tank|displacement|wave\s*speed|formula|calculate|hz\b|m\/s)\b|[λμνπωΔ]|v\s*=\s*f|[∪∩∈∅]/i;

const LITERARY_KEEP_CUE =
  /\b(?:dignity of work|pre-reading|akhtar|rukhsana|uncle inayat|prophet|khandaq|central idea|note for teachers|cobweb|spider|scotland)\b/i;

export function lineLooksLikeWeblinkSidebar(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (WEBLINK_LINE.test(trimmed)) return true;
  // Broken URL fragments left after OCR wrapping
  if (/^[a-z0-9._-]{6,}\/[a-z0-9._?=&%-]{4,}$/i.test(trimmed) && /watch|youtube|channel/i.test(trimmed)) {
    return true;
  }
  if (/^[a-z]+SCIEN/i.test(trimmed) || /^CE\s*$/i.test(trimmed)) return true;
  // Orphan YouTube/sidebar titles left after URL lines are removed
  if (
    /^(Waves[\s-].{0,40}|Tank Interference|and Wavelength|launchSCIEN\w*)$/i.test(trimmed)
  ) {
    return true;
  }
  return false;
}

function weblinkSignalCount(text: string): number {
  return (
    text.match(
      /youtube\.com|youtu\.be|weblinks?|encourage students to(?:\s*visit)?|visit below link|https?:\/\/|watch\?v=/gi,
    ) ?? []
  ).length;
}

/**
 * Drop interleaved weblink/sidebar lines from OCR that read left→right across columns.
 * No-op for literary pages and pages without weblink evidence.
 */
export function stripInterleavedWeblinkSidebar(text: string): string {
  const value = (text ?? '').trim();
  if (!value) return value;
  if (LITERARY_KEEP_CUE.test(value)) return value;

  const weblinkHits = weblinkSignalCount(value);
  if (weblinkHits < 1) {
    return value;
  }
  // Need either multiple weblink cues or one cue plus science/body structure.
  if (weblinkHits < 2 && !SCIENCE_BODY_CUE.test(value)) {
    return value;
  }

  const hasScienceBody = SCIENCE_BODY_CUE.test(value);
  const hasDenseUrls = weblinkHits >= 2;
  if (!hasScienceBody && !hasDenseUrls) return value;

  const lines = value.split(/\r?\n/);
  const kept = lines.filter((line) => !lineLooksLikeWeblinkSidebar(line));
  if (kept.length < 4) return value;
  if (kept.join('\n').trim().length < value.length * 0.35) return value;

  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
  const widths = lines.map((l) => Math.max(l.x1 - l.x0, 1));
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
  // Prefer a clear gutter; if weak, still try a left-sidebar cut when weblinks cluster left.
  const weblinkCount = lines.filter((l) => lineLooksLikeWeblinkSidebar(l.text)).length;
  const gapOk = bestGap >= pageWidth * 0.08 && splitAt >= 0;
  if (!gapOk) {
    if (weblinkCount < 2) return null;
    // Typical textbook left rail (~28–38% of page)
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
    const hits = band.filter((l) => lineLooksLikeWeblinkSidebar(l.text)).length;
    return hits / band.length;
  };
  const bodyChars = (band: OcrBoxLine[]) =>
    band
      .filter((l) => !lineLooksLikeWeblinkSidebar(l.text))
      .reduce((sum, l) => sum + l.text.replace(/\s+/g, '').length, 0);

  const leftW = bandWidth(left);
  const rightW = bandWidth(right);
  const leftWeb = weblinkDensity(left);
  const rightWeb = weblinkDensity(right);

  let main: OcrBoxLine[] | null = null;
  // Narrow left sidebar of weblinks → keep right body
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
