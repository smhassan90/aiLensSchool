import { fixLibraryTextEncoding } from '../library-books/fix-library-text-encoding';
import { TeachingPackForAnalysis } from '../library-books/chapter-teaching-pack-to-analysis';
import { splitSummaryAcrossDays } from './day-plan-allocate';
import {
  displayChapterTitle,
  isPackMetaPoint,
  polishTeacherLine,
  summarySentences,
  teachablePointsFromText,
} from './day-plan-content-quality';
import { detectSubjectProfile } from './subject-profiles';

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

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

export function isIndexLikeText(s: string): boolean {
  const lower = s.toLowerCase();
  return (
    (lower.includes('index') && lower.includes('page')) ||
    lower.includes('indexed subsection') ||
    lower.includes('listed on page') ||
    lower.includes('page hunt') ||
    lower.includes('index walk') ||
    lower.includes('page number')
  );
}

export function isLowValueContent(s: string): boolean {
  const lower = s.toLowerCase();
  return (
    isIndexLikeText(s) ||
    isPackMetaPoint(s) ||
    lower.includes('.pdf') ||
    lower.includes('not in religious') ||
    lower.includes('lesson pages listed') ||
    lower.includes('pages listed above') ||
    lower.includes('continue reading — part')
  );
}

function cleanSliceTitles(pack: TeachingPackForAnalysis): string[] {
  return dedupeLines(
    pack.readingSlices
      .map((s) => stripIndexMeta(fixLibraryTextEncoding(s.title)))
      .map((t) => t.replace(/^chapter opening and\s+/i, '').trim())
      .filter((t) => t.length > 4 && !isIndexLikeText(t) && !isPackMetaPoint(t)),
  );
}

export function collectPackTeachingPoints(pack: TeachingPackForAnalysis): string[] {
  const fromSummary = summarySentences(pack.summary).map((s) => polishTeacherLine(s, 180));
  if (fromSummary.length >= 2) return fromSummary.slice(0, 8);

  const raw = [
    ...asStringArray(pack.teacherGuide),
    ...pack.revisionPoints.map((r) => r.point),
  ]
    .map((p) => polishTeacherLine(stripIndexMeta(fixLibraryTextEncoding(p)), 180))
    .filter((p) => p.length > 18 && !isLowValueContent(p) && !isPackMetaPoint(p));

  return dedupeLines(raw).slice(0, 8);
}

export function pickCheckQuestions(
  pack: TeachingPackForAnalysis,
  sliceKey?: string,
  limit = 3,
): string[] {
  const fromPack = pack.questions
    .filter((q) => !sliceKey || q.sliceKey === sliceKey || q.sliceKey == null)
    .map((q) => polishTeacherLine(fixLibraryTextEncoding(q.question), 200))
    .filter((q) => q.length > 12 && !isIndexLikeText(q) && !isPackMetaPoint(q));

  const picked = dedupeLines(fromPack);
  if (picked.length >= limit) return picked.slice(0, limit);
  return picked;
}

function questionsFromSummary(sentences: string[], limit: number): string[] {
  const out: string[] = [];
  for (const s of sentences) {
    if (out.length >= limit) break;
    const idea = s.split(/[.!?]/)[0]?.trim() ?? s;
    if (idea.length < 12 || isPackMetaPoint(idea)) continue;
    out.push(polishTeacherLine(`What is ${idea.charAt(0).toLowerCase()}${idea.slice(1)}?`, 200));
  }
  return out;
}

function extractExampleTopic(summaryPortion: string, focusLabel: string): string {
  const points = teachablePointsFromText(summaryPortion, 1);
  if (points[0]) return points[0].replace(/[.!?]$/, '');
  const label = stripIndexMeta(focusLabel);
  if (label.length > 8 && !isPackMetaPoint(label)) return label;
  return 'today’s lesson ideas';
}

export function suggestExampleFromSummary(
  summaryPortion: string,
  focusLabel: string,
  subjectName: string,
): string {
  const topic = extractExampleTopic(summaryPortion, focusLabel);
  const subj = subjectName.toLowerCase();
  const profile = detectSubjectProfile(subjectName);

  if (
    profile === 'LANGUAGE' ||
    subj.includes('religious') ||
    subj.includes('islamiat') ||
    subj.includes('ethics')
  ) {
    return (
      `Example for the class (about 2 minutes): Tell a short, realistic story from school or neighbourhood life that shows “${topic.slice(0, 120)}”. ` +
      `After the story, ask two students: what value or teaching from the textbook did they see in the story?`
    );
  }

  return (
    `Example for the class: Connect “${topic.slice(0, 120)}” to something students already know (local news, sport, science, or family life). ` +
    `Ask one student to repeat the link in one clear sentence.`
  );
}

export function buildExpertTeachingDayPlan(input: {
  chapterTitle: string;
  subjectName: string;
  dayInChapter: number;
  totalDaysInChapter: number;
  portionText: string;
  portionLabel: string;
  isFirstDayOfChapter: boolean;
  explainPoints: string[];
  questions: string[];
  packSummary: string;
}): { objectives: string[]; teacherNotes: string } {
  const chapter = displayChapterTitle(input.chapterTitle);
  const label = stripIndexMeta(fixLibraryTextEncoding(input.portionLabel));

  const summaryPortion = polishTeacherLine(
    fixLibraryTextEncoding(input.portionText).trim() ||
      splitSummaryAcrossDays(input.packSummary, input.totalDaysInChapter)[input.dayInChapter - 1] ||
      '',
    900,
  );

  let teachPoints = teachablePointsFromText(summaryPortion, 5);
  if (teachPoints.length === 0) {
    teachPoints = dedupeLines(
      input.explainPoints
        .map((p) => polishTeacherLine(stripIndexMeta(fixLibraryTextEncoding(p)), 200))
        .filter((p) => !isPackMetaPoint(p) && !isLowValueContent(p)),
    ).slice(0, 4);
  }

  const focusTitle =
    label && !isLowValueContent(label) && !isPackMetaPoint(label)
      ? label.replace(/^chapter opening and\s+/i, '').trim()
      : teachPoints[0]?.replace(/[.!?]$/, '').slice(0, 80) ?? `Day ${input.dayInChapter} of ${chapter}`;

  const objectives: string[] = [];
  if (input.isFirstDayOfChapter) {
    objectives.push(`Introduce ${chapter} using the textbook opening.`);
  }
  for (const p of teachPoints.slice(0, 3)) {
    objectives.push(p);
  }
  if (objectives.length < 2) {
    objectives.push(`Teach: ${polishTeacherLine(focusTitle, 160)}`);
  }

  const summaryForQs = summarySentences(summaryPortion);
  const checkQuestions =
    input.questions.length > 0
      ? input.questions.slice(0, 4)
      : questionsFromSummary(summaryForQs.length ? summaryForQs : teachPoints, 3);

  const steps: string[] = [];
  if (input.isFirstDayOfChapter) {
    steps.push(`Opening (3 min): State today’s topic — ${focusTitle}. Ask what students already know about it.`);
  } else {
    steps.push(`Opening (2 min): One-sentence recap of yesterday, then state today’s topic — ${focusTitle}.`);
  }

  steps.push(`Teaching (18–22 min): Work through the textbook for ${focusTitle}.`);
  if (teachPoints.length > 0) {
    steps.push('Make sure students understand:');
    for (const p of teachPoints) {
      steps.push(`• ${p}`);
    }
  } else if (summaryPortion.length > 30) {
    steps.push(`• ${summaryPortion}`);
  }

  steps.push(suggestExampleFromSummary(summaryPortion || input.packSummary, focusTitle, input.subjectName));

  if (checkQuestions.length > 0) {
    steps.push('Ask before class ends:');
    for (const q of checkQuestions) {
      steps.push(`• ${q}`);
    }
  }

  const hw = teachPoints[0]?.replace(/[.!?]$/, '').slice(0, 90) || focusTitle;
  steps.push(`Homework: Re-read today’s pages and write three sentences on ${hw}.`);

  return {
    objectives: dedupeLines(objectives).slice(0, 4),
    teacherNotes: steps.join('\n'),
  };
}

/** @deprecated use buildExpertTeachingDayPlan */
export function buildSimpleDayPlan(input: {
  chapterTitle: string;
  dayInChapter: number;
  totalDaysInChapter: number;
  portionText: string;
  portionLabel: string;
  isFirstDayOfChapter: boolean;
}): { objectives: string[]; teacherNotes: string } {
  return buildExpertTeachingDayPlan({
    ...input,
    subjectName: 'General',
    explainPoints: [],
    questions: [],
    packSummary: '',
  });
}

function activityThemesFromPack(pack: TeachingPackForAnalysis): string[] {
  const fromSummary = collectPackTeachingPoints(pack);
  if (fromSummary.length >= 2) return fromSummary.slice(0, 6);

  const titles = cleanSliceTitles(pack);
  if (titles.length >= 2) {
    return titles.slice(0, 6).map((t) => polishTeacherLine(t, 100));
  }

  return [polishTeacherLine(fixLibraryTextEncoding(pack.summary).slice(0, 120), 120)];
}

export function buildChapterRecapActivity(input: {
  chapterTitle: string;
  subjectName: string;
  pack: TeachingPackForAnalysis;
}): { activityTitle: string; objectives: string[]; teacherNotes: string } {
  const chapter = displayChapterTitle(input.chapterTitle);
  const themes = activityThemesFromPack(input.pack);
  const sliceTitles = cleanSliceTitles(input.pack);
  const exitQs = [
    ...pickCheckQuestions(input.pack, undefined, 4),
    ...questionsFromSummary(themes, 2),
  ].slice(0, 4);

  const activityTitle =
    sliceTitles.length >= 2
      ? `Review: ${sliceTitles[0]} & ${sliceTitles[1]}`
      : `Review: ${chapter}`;

  const themeLines = themes.map((h, i) => `  ${i + 1}. ${polishTeacherLine(h, 160)}`);

  const notes: string[] = [
    `Students have finished ${chapter}. Use this period to recall and apply what they learned.`,
    '',
    'Setup (5 min):',
    `• Form ${Math.min(themes.length, 6)} groups. Each group receives one theme:`,
    ...themeLines,
    '',
    'Main task (25 min):',
    '• Each group prepares a two-minute presentation: one real-life example plus one sentence from the textbook.',
    '• Values and religious studies topics: allow a short role-play or poster instead of a speech.',
    '• Every student must speak at least once in the group.',
    '',
    'Present (8 min):',
    '• Groups share in turn. You add one missing detail after each group if needed.',
    ...(exitQs.length
      ? ['', 'Closing questions:', ...exitQs.map((q) => `• ${q}`)]
      : ['', 'Closing question: Which theme was hardest to explain in your own words?']),
    '',
    'Wrap (2 min): Praise effort and note that these ideas will appear in revision and tests.',
  ];

  return {
    activityTitle,
    objectives: [
      `Students recall the main ideas from ${chapter}.`,
      `Each group connects one theme to real life.`,
      themes.length > 1
        ? `Themes: ${themes.slice(0, 4).map((t) => t.replace(/[.!?]$/, '')).join('; ').slice(0, 200)}.`
        : polishTeacherLine(themes[0] ?? chapter, 160),
    ],
    teacherNotes: notes.join('\n'),
  };
}

export function chapterContentWeight(text: string, packSummary: string, sliceCount: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const summaryWords = packSummary.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(80, words, summaryWords, sliceCount * 60);
}

export function labelForTeachingDay(
  pack: TeachingPackForAnalysis,
  dayIndex: number,
  teachDays: number,
): string {
  const slices = pack.readingSlices;
  if (slices.length === 0) {
    return dayIndex === 0 ? 'Opening section' : `Section ${dayIndex + 1}`;
  }
  const slicesPerDay = Math.max(1, Math.ceil(slices.length / teachDays));
  const start = dayIndex * slicesPerDay;
  const daySlices = slices.slice(start, start + slicesPerDay);
  const titles = daySlices
    .map((s) =>
      stripIndexMeta(fixLibraryTextEncoding(s.title))
        .replace(/^chapter opening and\s+/i, '')
        .trim(),
    )
    .filter((t) => t.length > 3 && !isIndexLikeText(t) && !isPackMetaPoint(t));
  if (titles.length > 0) return titles.join(' · ');
  return `Section ${dayIndex + 1}`;
}

export function explainPointsForDay(
  pack: TeachingPackForAnalysis,
  dayIndex: number,
  teachDays: number,
): string[] {
  const portion =
    splitSummaryAcrossDays(fixLibraryTextEncoding(pack.summary), teachDays)[dayIndex] ?? '';
  const fromSummary = teachablePointsFromText(portion, 5);
  if (fromSummary.length > 0) return fromSummary;

  return collectPackTeachingPoints(pack).slice(0, 4);
}
