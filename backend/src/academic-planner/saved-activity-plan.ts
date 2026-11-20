import {
  activityMismatchesSkill,
  chapterIsSkillUnit,
  collectActivityCardIssues,
  splitStoredOutcome,
} from '../library-books/activity-focus';
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
  if (/students can use what\b/i.test(activity.learningObjective ?? '')) return false;
  return collectActivityCardIssues({ ...activity, steps: storedSteps(activity) }).length === 0;
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
  preferredSliceKeys?: string[];
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
  const preferred = new Set(input.preferredSliceKeys ?? []);
  const prepared = specific.filter((activity) => isPreparedClassroomActivity(activity));
  const onMain = prepared.find((activity) => activity.sliceKey != null && preferred.has(activity.sliceKey));
  if (onMain) return onMain;
  if (prepared[0]) return prepared[0];
  return specific[0] ?? null;
}

const EXAMPLE_MARKER =
  /\bexample\s+(answer|argument|verdict|question|decision|working)\b|\bworked example\b|\bfor example\b|\bsample\s*:|\bexample\s*:/i;

function sameLabel(left: string, right: string): boolean {
  return left.trim().toLowerCase().replace(/\s+/g, ' ') === right.trim().toLowerCase().replace(/\s+/g, ' ');
}

function firstDistinctSentence(description: string, title: string): string {
  const text = description.trim();
  const match = text.match(/^(.{12,}?[.!?])(?:\s|$)/);
  const sentence = (match?.[1] ?? '').trim();
  if (!sentence || sameLabel(sentence, title) || sameLabel(sentence, text)) return '';
  return sentence;
}

/** An objective a teacher can read. The title is not used as a stand-in. */
export function displayObjective(activity: SavedActivity): string {
  const title = activity.title?.trim() ?? '';
  const stored = activity.learningObjective?.trim() ?? '';
  if (stored && !sameLabel(stored, title)) return stored;
  return firstDistinctSentence(activity.description ?? '', title);
}

/** A saved card with enough of its own material to put in front of a class. Length alone does not hide it. */
export function isShowableSavedActivity(activity: SavedActivity, chapterText?: string): boolean {
  const title = activity.title?.trim() ?? '';
  const description = activity.description?.trim() ?? '';
  const objective = activity.learningObjective?.trim() ?? '';
  if (!title || !description || !objective || sameLabel(objective, title)) return false;
  if (!activity.participationTechnique?.trim()) return false;
  if (storedSteps(activity).length < 3) return false;
  if (!EXAMPLE_MARKER.test(description)) return false;
  if (/\b(relays?|hunts?|round[- ]robins?|sorting|matching pairs|quick chains?|terminolog(?:y|ies))\b/i.test(`${title}\n${objective}`)) {
    return false;
  }
  if (/\bshow the idea of\b/i.test(activity.expectedOutcome ?? '')) return false;
  if (
    /\b(pass(?:es|ed|ing)? (?:around|on|it|one step|the next)|one step of (?:a |the )?|stand(?:ing)? in a circle|sit(?:ting)? in a circle)\b/i.test(
      `${description}\n${storedSteps(activity).join('\n')}`,
    )
  ) {
    return false;
  }
  const hasFigure = /\b(given|to prove|the figure|radius|diameter)\b/i.test(description);
  if (chapterIsSkillUnit(chapterText) && !/\d/.test(description) && !hasFigure && !EXAMPLE_MARKER.test(description)) {
    return false;
  }
  return true;
}

/**
 * Notes for an Activity day.
 * A prepared activity is preferred. A saved card is still shown when it has its own objective, steps, and example.
 * A hollow game, or a pack with no activity, uses the short missing note.
 */
export function activityDayNotes(input: {
  chapterTitle: string;
  activities: SavedActivity[];
  preferredSliceKeys?: string[];
  periodMinutes?: number;
  chapterText?: string;
  missingReason?: string;
}): { notes: string; title: string; objective: string } {
  const sliceKeys = input.activities
    .map((activity) => activity.sliceKey)
    .filter((key): key is string => Boolean(key));
  const covered = [...new Set([...sliceKeys, ...(input.preferredSliceKeys ?? [])])];
  const ranked = (covered.length
    ? input.activities.filter((activity) => activity.sliceKey == null || covered.includes(activity.sliceKey))
    : input.activities
  ).filter((activity) => !isGenericSectionSummary(activity) && !isRecap(activity));
  const usable = (activity: SavedActivity) =>
    isPreparedClassroomActivity(activity) && !activityMismatchesSkill(activity, input.chapterText);
  const preferredReady = ranked.find(
    (activity) => activity.sliceKey != null && (input.preferredSliceKeys ?? []).includes(activity.sliceKey) && usable(activity),
  );
  const showable = (activity: SavedActivity) =>
    isShowableSavedActivity(activity, input.chapterText) && !activityMismatchesSkill(activity, input.chapterText);
  const selected = preferredReady ?? ranked.find(usable) ?? ranked.find(showable) ?? null;
  if (selected) {
    return {
      notes: formatSavedActivityNotes(selected, input.chapterTitle, [], input.periodMinutes ?? 40),
      title: selected.title,
      objective: displayObjective(selected) || `Apply the main idea of ${input.chapterTitle}.`,
    };
  }
  return {
    notes: formatUnavailableChapterNotes(
      input.chapterTitle,
      input.missingReason ?? `No saved activity for ${input.chapterTitle}.`,
      'ACTIVITY',
    ),
    title: 'Chapter activity',
    objective: `Apply the main idea of ${input.chapterTitle}.`,
  };
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
  const rawSteps = storedSteps(activity).filter((step) => !/use the student task below/i.test(step));
  const steps = rawSteps.length ? fittedSteps(rawSteps, minutes) : [];
  const objective = displayObjective(activity);
  const materials = activity.materials?.trim();
  const participation = activity.participationTechnique.trim();
  const stored = splitStoredOutcome(activity.expectedOutcome?.trim() ?? '');
  const outcome = /\bshow the idea of\b/i.test(stored.outcome) ? '' : stored.outcome;
  const check = stored.check;
  void alternatives;
  const lines = [
    `Chapter: ${chapterTitle}`,
    ...(objective ? [`Learning objective: ${objective}`] : []),
    ...(materials && !/^none$/i.test(materials) ? [`You need: ${materials}`] : []),
    `Duration: ${minutes} minutes`,
    '',
    'What students do:',
    activity.description.trim(),
    ...(steps.length
      ? ['', 'What the teacher does:', ...steps.map((step, index) => `${index + 1}. (${step.minutes} min) ${step.text}`)]
      : []),
    ...(participation ? ['', 'How every student participates:', participation] : []),
    ...(check ? ['', 'Check understanding:', check] : []),
    ...(outcome ? ['', `Expected outcome: ${outcome}`] : []),
  ];
  return lines.join('\n');
}

export function formatUnavailableChapterNotes(chapterTitle: string, reason: string, role: string): string {
  if (role === 'ACTIVITY') {
    const why = reason?.trim();
    return why
      ? `${why} Teach the next printed application in ${chapterTitle} from the textbook.`
      : `Teach the next printed application in ${chapterTitle} from the textbook.`;
  }
  return [
    `Teaching pack unavailable for ${chapterTitle}`,
    reason,
    '',
    `What you do: Teach the next printed section of ${chapterTitle} from the textbook.`,
    'What students do: Read that section and answer one question printed in the book.',
    'Check understanding: Accept only an answer the textbook supports.',
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
