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

function linesOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter((item) => item.length > 0);
}

function isRecap(activity: SavedActivity): boolean {
  return activity.sliceKey == null || /\brecap\b/i.test(activity.title);
}

/**
 * Pick one saved activity for this day.
 * A closing recap day prefers the whole-unit activity.
 * Any other day uses an unused activity whose section has already been taught.
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

  if (input.preferRecap) {
    const recap = unused.find((activity) => isRecap(activity) && studied(activity));
    if (recap) return recap;
  }
  const sectional = unused.find(
    (activity) => activity.sliceKey != null && covered.has(activity.sliceKey) && !isRecap(activity),
  );
  if (sectional) return sectional;
  if (input.preferRecap) {
    return unused.find(studied) ?? null;
  }
  return null;
}

export function formatSavedActivityNotes(
  activity: SavedActivity,
  chapterTitle: string,
  alternatives: SavedActivity[] = [],
): string {
  const steps = linesOf(activity.teacherSteps);
  const teacherSteps = steps.length
    ? steps.map((step, index) => `${index + 1}. ${step}`)
    : [`1. ${activity.description}`];
  const objective = activity.learningObjective?.trim() || activity.description;
  const duration = activity.durationMinutes
    ? `${activity.durationMinutes} minutes`
    : 'the class period set aside for this activity';
  const others = alternatives.filter((item) => item.title !== activity.title);
  return [
    activity.title,
    '',
    `Chapter: ${chapterTitle}`,
    `Section: ${activity.sliceKey ?? 'whole chapter'}`,
    `Learning objective: ${objective}`,
    `You need: ${activity.materials?.trim() || 'Textbook and notebooks'}`,
    `Duration: ${duration}`,
    '',
    'What the teacher does:',
    ...teacherSteps,
    '',
    'What students do:',
    activity.description,
    '',
    'How every student participates:',
    activity.participationTechnique,
    '',
    'Check understanding:',
    activity.expectedOutcome?.trim() || 'Ask two students to say what this activity asked them to do.',
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
  const words = title.toLowerCase().split(/\W+/).filter((word) => word.length > 3);
  const matched = guide.filter((bullet) => words.some((word) => bullet.toLowerCase().includes(word)));
  return (matched.length ? matched : guide).slice(0, 3);
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
