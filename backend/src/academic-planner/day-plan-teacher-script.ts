import { fixLibraryTextEncoding } from '../library-books/fix-library-text-encoding';
import { TeachingPackForAnalysis } from '../library-books/chapter-teaching-pack-to-analysis';
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
    lower.includes('.pdf') ||
    lower.includes('not in religious') ||
    lower.includes('lesson pages listed') ||
    lower.includes('pages listed above') ||
    lower.includes('continue reading — part')
  );
}

export function collectPackTeachingPoints(pack: TeachingPackForAnalysis): string[] {
  const raw = [
    ...asStringArray(pack.teacherGuide),
    ...pack.readingSlices.flatMap((s) => asStringArray(s.explainPoints)),
    ...pack.revisionPoints.map((r) => r.point),
  ].map((p) => stripIndexMeta(fixLibraryTextEncoding(p)));

  return dedupeLines(raw.filter((p) => p.length > 12 && !isLowValueContent(p)));
}

export function pickCheckQuestions(
  pack: TeachingPackForAnalysis,
  sliceKey?: string,
  limit = 3,
): string[] {
  const fromPack = pack.questions
    .filter((q) => !sliceKey || q.sliceKey === sliceKey || q.sliceKey == null)
    .map((q) => fixLibraryTextEncoding(q.question))
    .filter((q) => q.length > 12 && !isIndexLikeText(q));

  const picked = dedupeLines(fromPack);
  if (picked.length >= limit) return picked.slice(0, limit);
  return picked;
}

function questionsFromTeachPoints(points: string[], limit: number): string[] {
  const out: string[] = [];
  for (const p of points) {
    if (out.length >= limit) break;
    const idea = p.split(/[.!?]/)[0]?.trim() ?? p;
    if (idea.length < 8) continue;
    out.push(`Explain in your own words: ${idea.slice(0, 140)}.`);
  }
  return out;
}

function suggestStoryExample(point: string, subjectName: string): string {
  const topic = point.slice(0, 160);
  const profile = detectSubjectProfile(subjectName);
  const subj = subjectName.toLowerCase();
  if (
    profile === 'LANGUAGE' ||
    subj.includes('religious') ||
    subj.includes('islamiat') ||
    subj.includes('ethics')
  ) {
    return `Story for class: describe a short situation from school or neighbourhood life where someone shows this idea — “${topic}”. After the story, ask: “Which value did we see? Where in today’s lesson does the book say the same thing?”`;
  }
  return `Example for class: link “${topic}” to something students already know (news, family, sport, or science around them). End by asking one student to restate the link in one sentence.`;
}

function usablePortionBody(body: string, explainPoints: string[]): string {
  const cleaned = stripIndexMeta(fixLibraryTextEncoding(body)).trim();
  if (cleaned.length >= 80 && !isLowValueContent(cleaned)) {
    return cleaned.length > 500 ? `${cleaned.slice(0, 500)}…` : cleaned;
  }
  if (explainPoints.length > 0) {
    return explainPoints.slice(0, 4).join('\n• ');
  }
  return '';
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
  const chapter = fixLibraryTextEncoding(input.chapterTitle);
  const label = stripIndexMeta(fixLibraryTextEncoding(input.portionLabel));
  const teachPoints = dedupeLines(
    input.explainPoints.map((p) => stripIndexMeta(fixLibraryTextEncoding(p))).filter((p) => p.length > 8),
  );

  if (teachPoints.length === 0) {
    const summaryBits = fixLibraryTextEncoding(input.packSummary)
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20 && !isLowValueContent(s));
    teachPoints.push(...summaryBits.slice(0, 3));
  }

  const focusTitle =
    label && !isLowValueContent(label) ? label : teachPoints[0]?.slice(0, 100) ?? chapter;

  const objectives: string[] = [];
  if (input.isFirstDayOfChapter) {
    objectives.push(`Open “${chapter}” and set why these ideas matter in daily life.`);
  }
  for (const p of teachPoints.slice(0, 3)) {
    objectives.push(p.length > 160 ? `${p.slice(0, 157)}…` : p);
  }
  if (objectives.length < 2) {
    objectives.push(`Teach today’s section: ${focusTitle}.`);
  }

  const checkQuestions =
    input.questions.length > 0
      ? input.questions.slice(0, 4)
      : questionsFromTeachPoints(teachPoints, 3);

  const mainPoint = teachPoints[0] ?? focusTitle;
  const portionSnippet = usablePortionBody(input.portionText, teachPoints);

  const steps: string[] = [];
  if (input.isFirstDayOfChapter) {
    steps.push(
      `Start (3 min): Name the chapter “${chapter}”. Ask what students already know about ${focusTitle.split('·')[0]?.trim() || 'this topic'}.`,
    );
  } else {
    steps.push(`Start (2 min): Quick recap — ask one volunteer to summarise yesterday’s main idea in ${chapter}.`);
  }

  steps.push(`Teach (18–22 min) — today’s focus: ${focusTitle}`);
  if (teachPoints.length > 0) {
    steps.push('Explain these points clearly (use the textbook for exact wording):');
    for (const p of teachPoints.slice(0, 5)) {
      steps.push(`• ${p}`);
    }
  } else if (portionSnippet) {
    steps.push(`Use this from the chapter:\n${portionSnippet.startsWith('•') ? portionSnippet : `• ${portionSnippet}`}`);
  } else {
    steps.push(`Work through the textbook section for “${focusTitle}”.`);
  }

  steps.push(suggestStoryExample(mainPoint, input.subjectName));

  if (checkQuestions.length > 0) {
    steps.push('Questions to ask before you finish:');
    for (const q of checkQuestions) {
      steps.push(`• ${q}`);
    }
  }

  const hwTopic = teachPoints[0]?.slice(0, 80) || focusTitle;
  steps.push(`Homework: re-read today’s portion and write 3 lines on “${hwTopic}”.`);

  return {
    objectives: dedupeLines(objectives).slice(0, 5),
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

function isWeakPackActivity(act: { title: string; description: string }): boolean {
  const blob = `${act.title} ${act.description}`.toLowerCase();
  return isIndexLikeText(blob) || blob.includes('circle') && blob.includes('page');
}

export function buildChapterRecapActivity(input: {
  chapterTitle: string;
  subjectName: string;
  pack: TeachingPackForAnalysis;
}): { activityTitle: string; objectives: string[]; teacherNotes: string } {
  const chapter = fixLibraryTextEncoding(input.chapterTitle);
  const points = collectPackTeachingPoints(input.pack);
  const sliceTitles = dedupeLines(
    input.pack.readingSlices
      .map((s) => stripIndexMeta(fixLibraryTextEncoding(s.title)))
      .filter((t) => t.length > 4 && !isIndexLikeText(t)),
  );
  const exitQs = [
    ...pickCheckQuestions(input.pack, undefined, 4),
    ...questionsFromTeachPoints(points, 2),
  ].slice(0, 4);

  const packAct = input.pack.activities[0];
  if (packAct && !isWeakPackActivity(packAct)) {
    const desc = fixLibraryTextEncoding(packAct.description);
    const technique = fixLibraryTextEncoding(packAct.participationTechnique);
    if (desc.length > 40 && !isIndexLikeText(desc)) {
      return {
        activityTitle: fixLibraryTextEncoding(packAct.title),
        objectives: [
          `Revisit main ideas from “${chapter}” through an active task.`,
          `Cover these themes: ${(sliceTitles.slice(0, 3).join('; ') || points.slice(0, 2).join('; ')).slice(0, 200)}.`,
        ],
        teacherNotes: [desc, '', technique, '', exitQs.length ? `Closing questions:\n${exitQs.map((q) => `• ${q}`).join('\n')}` : ''].join('\n'),
      };
    }
  }

  const headings =
    points.length >= 3
      ? points.slice(0, Math.min(6, points.length))
      : sliceTitles.length >= 2
        ? sliceTitles.slice(0, 6)
        : [`Main ideas from ${chapter}`];

  const activityTitle =
    sliceTitles.length > 0
      ? `Recall game: ${sliceTitles.slice(0, 2).join(' & ')}`
      : `Recall game: ${chapter}`;

  const notes: string[] = [
    `You have finished teaching “${chapter}”. This period is for fun review — every student should speak or write at least once.`,
    '',
    'Setup (5 min):',
    `• ${headings.length} groups (or stations). Each group gets one theme:`,
    ...headings.map((h, i) => `  ${i + 1}. ${h.slice(0, 120)}`),
    '',
    'Main task (25 min):',
    '• Each group prepares a 2-minute presentation: one real-life example + one sentence from the textbook that supports it.',
    '• Optional props: chart paper, sticky notes, or a short role-play (especially for values / religious studies topics).',
    '• Rotate or present so all major themes are heard.',
    '',
    'Share & reflect (8 min):',
    '• After each group, you add one “teacher example” to fill any gap.',
    ...(exitQs.length
      ? ['', 'Ask the class:', ...exitQs.map((q) => `• ${q}`)]
      : ['', 'Ask: “Which theme was hardest to explain? Why?”']),
    '',
    'Wrap (2 min): praise effort; remind students these ideas will return in revision and assessments.',
  ];

  return {
    activityTitle,
    objectives: [
      `Students recall the major ideas taught in “${chapter}”.`,
      `Every learner connects at least one theme to real life.`,
      headings.length > 1 ? `Themes covered: ${headings.slice(0, 4).join('; ').slice(0, 220)}.` : `Theme: ${headings[0]?.slice(0, 120) ?? chapter}.`,
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
    return dayIndex === 0 ? 'Opening of the chapter' : `Next part of the chapter (day ${dayIndex + 1})`;
  }
  const slicesPerDay = Math.max(1, Math.ceil(slices.length / teachDays));
  const start = dayIndex * slicesPerDay;
  const daySlices = slices.slice(start, start + slicesPerDay);
  const titles = daySlices
    .map((s) => stripIndexMeta(fixLibraryTextEncoding(s.title)))
    .filter((t) => t.length > 3 && !isIndexLikeText(t));
  if (titles.length > 0) return titles.join(' · ');
  return daySlices[0] ? stripIndexMeta(fixLibraryTextEncoding(daySlices[0].title)) : `Section ${dayIndex + 1}`;
}

export function explainPointsForDay(
  pack: TeachingPackForAnalysis,
  dayIndex: number,
  teachDays: number,
): string[] {
  const slices = pack.readingSlices;
  if (slices.length === 0) return collectPackTeachingPoints(pack).slice(0, 4);
  const slicesPerDay = Math.max(1, Math.ceil(slices.length / teachDays));
  const start = dayIndex * slicesPerDay;
  const daySlices = slices.slice(start, start + slicesPerDay);
  const points = daySlices.flatMap((s) => asStringArray(s.explainPoints));
  const cleaned = dedupeLines(
    points.map((p) => stripIndexMeta(fixLibraryTextEncoding(p))).filter((p) => p.length > 8 && !isIndexLikeText(p)),
  );
  return cleaned.length > 0 ? cleaned : collectPackTeachingPoints(pack).slice(0, 4);
}
