import { fixLibraryTextEncoding } from '../library-books/fix-library-text-encoding';

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function stripIndexMeta(s: string): string {
  return s
    .replace(/\bpage\s+\d+\b/gi, '')
    .replace(/\bindex(ed)?\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isIndexLikeText(s: string): boolean {
  const lower = s.toLowerCase();
  return (
    (lower.includes('index') && lower.includes('page')) ||
    lower.includes('indexed subsection') ||
    lower.includes('listed on page')
  );
}

export function buildSimpleDayPlan(input: {
  chapterTitle: string;
  dayInChapter: number;
  totalDaysInChapter: number;
  portionText: string;
  portionLabel: string;
  isFirstDayOfChapter: boolean;
}): { objectives: string[]; teacherNotes: string } {
  const chapter = fixLibraryTextEncoding(input.chapterTitle);
  const portion = stripIndexMeta(fixLibraryTextEncoding(input.portionText)).slice(0, 1200);
  const label = fixLibraryTextEncoding(input.portionLabel);

  const objectives: string[] = [];
  const shortLabel = stripIndexMeta(label).slice(0, 120) || 'the next part of the chapter';
  if (input.isFirstDayOfChapter) {
    objectives.push(`Introduce the chapter “${chapter}” clearly.`);
    objectives.push(`Start with: ${shortLabel}.`);
  } else {
    objectives.push(`Same chapter — pick up after yesterday’s lesson.`);
    objectives.push(`Today cover: ${shortLabel}.`);
  }
  objectives.push('Use one simple example from real life.');
  objectives.push('Ask 2–3 quick questions before the bell.');

  const steps: string[] = [];
  if (input.isFirstDayOfChapter) {
    steps.push('Start with a warm greeting and name the chapter topic in one sentence.');
    steps.push(`Tell students why ${chapter} matters in everyday life (1–2 minutes).`);
  } else {
    steps.push('Begin with a 2-minute recap of the previous lesson.');
  }
  steps.push('Read or explain today’s text slowly in simple Urdu/English (as your class uses).');
  if (portion && !isIndexLikeText(portion)) {
    const snippet = portion.length > 400 ? `${portion.slice(0, 400)}…` : portion;
    steps.push(`Focus on this content today:\n${snippet}`);
  } else if (label) {
    steps.push(`Cover: ${label}. Use the textbook pages for exact wording.`);
  }
  steps.push('Give one concrete example, then ask a student to repeat the main idea.');
  steps.push('Note homework: read the same portion once at home if possible.');

  return {
    objectives: dedupeLines(objectives).slice(0, 5),
    teacherNotes: dedupeLines(steps).join('\n'),
  };
}

export function chapterContentWeight(text: string, packSummary: string, sliceCount: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const summaryWords = packSummary.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(80, words, summaryWords, sliceCount * 60);
}
