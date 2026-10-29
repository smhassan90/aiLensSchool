import { fixLibraryTextEncoding } from '../library-books/fix-library-text-encoding';

/** Aggressive filter for index-outline / meta bullets stored as “explain points”. */
export function isPackMetaPoint(s: string): boolean {
  const t = fixLibraryTextEncoding(s).replace(/\s+/g, ' ').trim();
  if (t.length < 18) return true;
  const lower = t.toLowerCase();

  const metaPatterns = [
    /^the chapter is chapter/i,
    /\btheme is social and moral/i,
    /\bfirst (indexed )?subsection\b/i,
    /\blisted on\s*[.)]?\s*$/i,
    /\blisted on page\b/i,
    /^preview\b/i,
    /^explain that the first listed/i,
    /\bopens the chapter.s treatment\b/i,
    /\bas the section where different\b/i,
    /\bname the four values the section title\b/i,
    /\blink the title to how accountabil/i,
    /\btreatment of values in a rel\b/i,
    /\bworship settin\b/i,
    /\(\s*\)/,
    /\bindex presents topics\b/i,
    /\bprinted page numbers\b/i,
    /\bis organized through five indexed sections\b/i,
    /\bis titled social and moral values and is organized\b/i,
    /^chapter \d+ is titled\b/i,
    /\bthe sections move from glory of the lord to places of worship\b/i,
  ];

  if (metaPatterns.some((re) => re.test(t) || re.test(lower))) return true;
  if (lower.includes('preview ') && lower.includes('()')) return true;
  if (/\blisted on\s*\)/i.test(t)) return true;
  if (t.endsWith('(') || /\(\s*$/.test(t)) return true;

  return false;
}

export function displayChapterTitle(title: string): string {
  let t = fixLibraryTextEncoding(title).replace(/\s+/g, ' ').trim();
  const m = t.match(/^chapter\s+(\d+)\s*[—–\-]\s*(.+)$/i);
  if (m) return `Ch. ${m[1]}: ${m[2].trim()}`;
  return t;
}

export function polishTeacherLine(s: string, maxLen = 220): string {
  let t = fixLibraryTextEncoding(s)
    .replace(/\s+/g, ' ')
    .replace(/\(\s*\)/g, '')
    .replace(/^preview\s+/i, '')
    .replace(/^explain that\s+/i, '')
    .trim();

  if (t.length > maxLen) {
    const cut = t.slice(0, maxLen);
    const lastStop = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('?'), cut.lastIndexOf('!'));
    if (lastStop > maxLen * 0.45) {
      t = cut.slice(0, lastStop + 1);
    } else {
      const lastSpace = cut.lastIndexOf(' ');
      t = lastSpace > 40 ? `${cut.slice(0, lastSpace)}.` : `${cut}.`;
    }
  }

  if (t && !/[.!?]$/.test(t)) t = `${t}.`;
  if (t.length > 0) t = t.charAt(0).toUpperCase() + t.slice(1);
  return t;
}

export function summarySentences(summary: string): string[] {
  const fixed = fixLibraryTextEncoding(summary).replace(/\r/g, '').trim();
  if (!fixed) return [];

  return fixed
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 20 && !isPackMetaPoint(s));
}

export function teachablePointsFromText(text: string, limit = 5): string[] {
  const sentences = summarySentences(text);
  const out: string[] = [];
  for (const s of sentences) {
    const line = polishTeacherLine(s, 200);
    if (line.length >= 20 && !isPackMetaPoint(line)) out.push(line);
    if (out.length >= limit) break;
  }
  return out;
}
