import { activityFitScore, isGenericSectionSummary, lessonActivityScript } from '../library-books/activity-quality';

export type SavedActivity = {
  sliceKey: string | null;
  title: string;
  description: string;
  participationTechnique: string;
  materials?: string | null;
  learningObjective?: string | null;
  teacherSteps?: unknown;
  expectedOutcome?: string | null;
  durationMinutes?: number | null;
};

function isRecap(activity: SavedActivity): boolean {
  return activity.sliceKey == null || /\brecap\b/i.test(activity.title);
}

/**
 * Pick one saved activity whose section has already been taught.
 * A closing day still prefers a chapter-specific task. The generic
 * "each group summarises every section" recap is used only when nothing else fits.
 */
export function selectSavedActivity(input: {
  activities: SavedActivity[];
  coveredSliceKeys: string[];
  usedTitles: string[];
  preferRecap: boolean;
}): SavedActivity | null {
  const used = new Set(input.usedTitles.map((title) => title.trim().toLowerCase()));
  const unused = input.activities.filter((activity) => !used.has(activity.title.trim().toLowerCase()));
  const covered = new Set(input.coveredSliceKeys);
  const studied = (activity: SavedActivity) => activity.sliceKey == null || covered.has(activity.sliceKey);
  const specific = unused.filter(
    (activity) => studied(activity) && activity.sliceKey != null && !isGenericSectionSummary(activity),
  );

  if (!input.preferRecap) {
    return specific[0] ?? null;
  }

  if (specific.length) {
    const ranked = [...specific].sort((left, right) => activityFitScore(right) - activityFitScore(left));
    const best = ranked[0];
    if (!best) return null;
    const bestScore = activityFitScore(best);
    const writingPlan = /essay|persuasive|argumentative/i.test(`${best.title} ${best.description}`);
    if (writingPlan) {
      const interactive = ranked.find(
        (activity) =>
          activityFitScore(activity) >= bestScore - 8 &&
          /debate|presentation|consensus|diary|poem|scenario|speech|role-play|role play/i.test(
            `${activity.title} ${activity.description}`,
          ),
      );
      if (interactive) return interactive;
    }
    return best;
  }
  return unused.find((activity) => isRecap(activity) && studied(activity)) ?? null;
}

export function formatSavedActivityNotes(
  activity: SavedActivity,
  chapterTitle: string,
  alternatives: SavedActivity[] = [],
  periodMinutes = 40,
): string {
  const script = lessonActivityScript(activity, periodMinutes);
  const minutes = script.timing.reduce((sum, block) => sum + block.minutes, 0);
  const others = alternatives.filter((item) => item.title !== activity.title);
  return [
    activity.title,
    '',
    `Chapter: ${chapterTitle}`,
    `Section: ${activity.sliceKey ?? 'whole chapter'}`,
    `Learning objective: ${script.learningObjective}`,
    `You need: ${activity.materials?.trim() || 'Textbook and notebooks'}`,
    `Duration: ${minutes} minutes`,
    ...script.timing.map((block) => `- ${block.label}: ${block.minutes} minutes.`),
    '',
    'What the teacher does:',
    ...script.teacherSteps.map((step, index) => `${index + 1}. ${step}`),
    '',
    'What students do:',
    script.studentTask,
    '',
    'How every student participates:',
    script.participation,
    '',
    'Check understanding:',
    script.checkUnderstanding,
    `Expected outcome: ${script.expectedOutcome}`,
    ...(others.length
      ? ['', 'Other saved activities for this chapter:', ...others.map((item) => `- ${item.title}`)]
      : []),
  ].join('\n');
}

export function formatUnavailableChapterNotes(chapterTitle: string, reason: string, role: string): string {
  const activity = role === 'ACTIVITY';
  return [
    activity
      ? `FALLBACK — no saved activity for ${chapterTitle}`
      : `Teaching pack unavailable for ${chapterTitle}`,
    reason,
    '',
    `What you do: Teach the next printed section of ${chapterTitle} from the textbook.`,
    'What students do: Read that section and answer one question printed in the book.',
    'Check understanding: Ask two students to point to the sentence they used.',
    activity ? `This fallback is only for ${chapterTitle}. Do not replace it with a generic game.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function guideLines(teacherGuide: unknown): string[] {
  if (!Array.isArray(teacherGuide)) return [];
  return teacherGuide.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function explainLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function guideForSection(guide: string[], title: string): string[] {
  const ignored = new Set([
    'unit',
    'section',
    'reading',
    'comprehension',
    'practice',
    'communication',
    'language',
    'study',
    'skills',
  ]);
  const words = title
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 3 && !ignored.has(word));
  if (!words.length) return [];
  return guide.filter((bullet) => words.some((word) => bullet.toLowerCase().includes(word))).slice(0, 3);
}

export function introLessonNotes(
  chapterTitle: string,
  slices: Array<{ title: string }>,
  teacherGuide: unknown,
): string {
  const names = slices.map((slice) => slice.title).filter(Boolean).slice(0, 8);
  const guide = guideLines(teacherGuide);
  const opening = guide[0] ?? (names[0] ? `Start with ${names[0]}.` : `Open ${chapterTitle}.`);
  return [
    `Open ${chapterTitle}.`,
    '',
    'What you do:',
    `1. Tell the class the sections in this chapter: ${names.join(', ') || chapterTitle}.`,
    `2. ${opening}`,
    '',
    'What students do: Say one thing they already know about the first section.',
    'Check understanding: Ask two students to name a section they will study. Correct the names from the textbook.',
  ].join('\n');
}

export function readingLessonNotes(
  slices: Array<{ title: string; readingFrom: string; explainPoints: unknown }>,
  teacherGuide: unknown,
): string {
  const guide = guideLines(teacherGuide);
  return slices
    .map((slice) => {
      const points = explainLines(slice.explainPoints).slice(0, 3);
      const actions = guideForSection(guide, slice.title);
      const steps = (actions.length ? actions : points.map((point) => `Explain: ${point}`)).slice(0, 3);
      const quote = slice.readingFrom.replace(/\s+/g, ' ').trim().slice(0, 220);
      return [
        `Section: ${slice.title}`,
        'What you do:',
        ...steps.map((step, index) => `${index + 1}. ${step}`),
        'What students do:',
        `Read this part aloud: "${quote}"`,
        'Check understanding: Ask two students to say one fact from this section in their own words. Correct them from the textbook.',
      ].join('\n');
    })
    .join('\n\n');
}

export function exerciseLessonNotes(
  chapterTitle: string,
  questions: Array<{ question: string; expectedAnswer?: string | null }>,
  sectionTitle?: string,
): string {
  const listed = questions.slice(0, 4);
  const checks = listed.length
    ? listed.map((question) => {
        const answer = question.expectedAnswer?.replace(/\s+/g, ' ').trim();
        return `• ${question.question}${answer ? ` Accept: ${answer.slice(0, 180)}` : ''}`;
      })
    : [`• Use the exercise printed in ${chapterTitle}. Do not skip a printed item.`];
  return [
    sectionTitle ? `Exercises for ${sectionTitle}` : `Exercises for ${chapterTitle}`,
    '',
    'What you do: Read the exercise instruction in the textbook, then complete the first item with the class.',
    'What students do: Complete the next items in the textbook and compare with a partner.',
    'Check understanding:',
    ...checks,
  ].join('\n');
}

export function slicesForReadingDay<T>(slices: T[], dayIndex: number, dayCount: number): T[] {
  if (!slices.length || dayCount <= 0) return [];
  const perDay = Math.max(1, Math.ceil(slices.length / dayCount));
  const start = dayIndex * perDay;
  return slices.slice(start, start + perDay);
}
