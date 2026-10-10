import { lineLooksLikeMathOrFormula } from '../common/math-lesson-text';

const SECTION_HEADING_RE =
  /^(?:#{1,3}\s+.+|[A-Z][A-Z0-9][A-Z0-9 \-/()]{2,60}|(?:Unit|Chapter|Section|Topic|Lesson)\s+[\dA-Za-z].{0,80}|\d{1,2}\.\d{0,2}\s+[A-Z].{2,80}|(?:Worked\s+Example|Self[- ]?Assessment|Numericals?|Summary|Concept\s+Map|Exercise\s+\d+|Pre[- ]?reading).{0,40})$/i;

export type LessonSection = { title: string; body: string };

/** Split lesson text into titled chunks so exams can sample across the whole chapter. */
export function splitLessonSections(text: string): LessonSection[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const sections: LessonSection[] = [];
  let title = 'Opening';
  let buf: string[] = [];

  const flush = () => {
    const body = buf.join('\n').trim();
    if (!body && sections.length) return;
    sections.push({ title: title.trim() || 'Section', body });
    buf = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && SECTION_HEADING_RE.test(trimmed) && buf.length > 0) {
      flush();
      title = trimmed.replace(/^#+\s*/, '');
      continue;
    }
    if (trimmed && SECTION_HEADING_RE.test(trimmed) && buf.length === 0 && sections.length === 0) {
      title = trimmed.replace(/^#+\s*/, '');
      continue;
    }
    buf.push(line);
  }
  flush();
  if (!sections.length && text.trim()) {
    return [{ title: 'Lesson', body: text.trim() }];
  }
  return sections.filter((s) => s.body.length > 0 || s.title !== 'Opening');
}

/** Formula / symbol lines the exam must be able to assess. */
export function extractFormulaLines(text: string, max = 24): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim().replace(/\s+/g, ' ');
    if (!line || line.length > 160) continue;
    if (!lineLooksLikeMathOrFormula(line)) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Evenly sample from each section so mid/late chapter content (formulas, numericals)
 * is not dropped when the lesson is longer than maxChars.
 */
export function sampleLessonTextEvenly(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (trimmed.length <= maxChars) return trimmed;

  const sections = splitLessonSections(trimmed);
  if (sections.length <= 1) {
    // Head + mid + tail slices so definitions and later formulas both survive.
    const third = Math.floor(maxChars / 3);
    const head = trimmed.slice(0, third).trim();
    const midStart = Math.max(0, Math.floor(trimmed.length / 2) - Math.floor(third / 2));
    const mid = trimmed.slice(midStart, midStart + third).trim();
    const tail = trimmed.slice(Math.max(0, trimmed.length - third)).trim();
    return [head, '…', mid, '…', tail].join('\n').slice(0, maxChars);
  }

  const totalLen = sections.reduce((n, s) => n + s.body.length, 0) || 1;
  const parts: string[] = [];
  let used = 0;
  const overhead = sections.length * 40;

  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i]!;
    const remainingSections = sections.length - i;
    const remainingBudget = Math.max(120, maxChars - used - overhead);
    const share = Math.max(
      180,
      Math.floor((section.body.length / totalLen) * (maxChars - overhead)),
    );
    const budget = Math.min(share, Math.floor(remainingBudget / remainingSections) + share);
    const slice =
      section.body.length <= budget
        ? section.body
        : `${section.body.slice(0, budget).trim()}…`;
    const block = `### ${section.title}\n${slice}`;
    parts.push(block);
    used += block.length;
    if (used >= maxChars) break;
  }

  const joined = parts.join('\n\n');
  return joined.length <= maxChars ? joined : `${joined.slice(0, maxChars - 1).trim()}…`;
}

/** Build prompt extras: section checklist + formulas the paper must cover. */
export function buildExamCoverageBlock(text: string): string {
  const sections = splitLessonSections(text);
  const titles = sections
    .map((s) => s.title)
    .filter((t) => t && t !== 'Opening')
    .slice(0, 16);
  const formulas = extractFormulaLines(text);
  const lines: string[] = [];
  if (titles.length >= 2) {
    lines.push(
      `Section checklist (cover evenly — do not take all questions from only one): ${titles.join(' | ')}`,
    );
  }
  if (formulas.length) {
    lines.push(
      `Formulas & symbols present (MUST set questions that use these ideas / notation where marks allow): ${formulas.join(' ;; ')}`,
    );
  }
  return lines.join('\n');
}

/** Per-lesson exam excerpt budget when several lectures are selected. */
export function examExcerptBudget(lessonCount: number): number {
  const n = Math.max(1, lessonCount);
  if (n === 1) return 7000;
  if (n === 2) return 4500;
  return Math.max(2800, Math.floor(10000 / n));
}
