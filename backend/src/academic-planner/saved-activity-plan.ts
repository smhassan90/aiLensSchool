import { isGenericSectionSummary } from '../library-books/activity-quality';
import { teacherGuideBullets } from './section-teaching-plan';

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

function storedSteps(activity: SavedActivity): string[] {
  if (!Array.isArray(activity.teacherSteps)) return [];
  return activity.teacherSteps
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((step) => step.trim());
}

/** A saved activity the teacher can run because the model wrote the material, not a section template. */
export function isPreparedClassroomActivity(activity: SavedActivity): boolean {
  const description = activity.description?.trim() ?? '';
  const blob = `${activity.title} ${description}`;
  if (isGenericSectionSummary(activity)) return false;
  if (/complete the task printed in|write your own answer|correct the language exercise|collect points with wh-questions/i.test(blob)) {
    return false;
  }
  return description.length >= 450 && storedSteps(activity).length >= 3;
}

/**
 * Use the activity the model prepared for this chapter.
 * Title words such as oral, debate, or group do not change the choice.
 * A section-summary recap is used only when nothing else fits.
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

  if (!specific.length) {
    return unused.find((activity) => isRecap(activity) && studied(activity)) ?? null;
  }
  void input.preferRecap;
  const prepared = specific.find((activity) => isPreparedClassroomActivity(activity));
  if (prepared) return prepared;
  return specific[0] ?? null;
}

function fittedSteps(steps: string[], total: number): Array<{ minutes: number; text: string }> {
  const parsed = steps.map((step) => {
    const match = step.match(/^\(?\s*(\d+)\s*min(?:utes)?\)?\s*[.:\-]?\s*/i);
    const text = (match ? step.slice(match[0].length) : step).trim() || step;
    return { minutes: match ? Number(match[1]) : 0, text };
  });
  const known = parsed.every((step) => step.minutes > 0) ? parsed.reduce((sum, step) => sum + step.minutes, 0) : 0;
  if (known === total) return parsed;
  const count = Math.max(1, parsed.length);
  const base = Math.max(3, Math.floor(total / count));
  return parsed.map((step, index) => ({
    minutes: index === count - 1 ? total - base * (count - 1) : base,
    text: step.text,
  }));
}

export function formatSavedActivityNotes(
  activity: SavedActivity,
  chapterTitle: string,
  alternatives: SavedActivity[] = [],
  periodMinutes = 40,
): string {
  const minutes = Math.max(20, Math.min(80, periodMinutes || activity.durationMinutes || 40));
  const steps = fittedSteps(storedSteps(activity), minutes);
  const objective = activity.learningObjective?.trim() || activity.title;
  const materials = activity.materials?.trim();
  const participation = activity.participationTechnique.trim();
  const outcome = activity.expectedOutcome?.trim() || `Students show the idea of ${activity.title} in their own work.`;
  const others = alternatives.filter((item) => item.title !== activity.title && !isGenericSectionSummary(item));
  const lines = [
    activity.title,
    '',
    `Chapter: ${chapterTitle}`,
    `Learning objective: ${objective}`,
    ...(materials && !/^none$/i.test(materials) ? [`You need: ${materials}`] : []),
    `Duration: ${minutes} minutes`,
    ...steps.map((step) => `- ${step.text}: ${step.minutes} minutes.`),
    '',
    'What students do:',
    activity.description.trim(),
    '',
    'What the teacher does:',
    ...(steps.length
      ? steps.map((step, index) => `${index + 1}. (${step.minutes} min) ${step.text}`)
      : ['1. Use the student task below. Do not replace it with a different activity.']),
    '',
    'How every student participates:',
    participation,
    '',
    'Check understanding:',
    outcome,
    `Expected outcome: ${outcome}`,
    ...(others.length
      ? ['', 'Other saved activities for this chapter:', ...others.map((item) => `- ${item.title}`)]
      : []),
  ];
  return lines.join('\n');
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
  return teacherGuideBullets(teacherGuide);
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
