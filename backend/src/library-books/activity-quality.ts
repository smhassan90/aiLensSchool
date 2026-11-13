import type { SavedActivity } from '../academic-planner/saved-activity-plan';

const STOP = new Set([
  'about',
  'after',
  'also',
  'from',
  'have',
  'into',
  'that',
  'their',
  'them',
  'then',
  'they',
  'this',
  'with',
  'your',
  'students',
  'student',
  'textbook',
  'section',
  'chapter',
  'class',
]);

export type TimedBlock = { label: string; minutes: number };

export type LessonActivityScript = {
  learningObjective: string;
  teacherSteps: string[];
  studentTask: string;
  participation: string;
  checkUnderstanding: string;
  expectedOutcome: string;
  timing: TimedBlock[];
};

type ActivityLike = SavedActivity & { steps?: unknown };

/** The stock "each group owns one section" recap. A real chapter task is not this. */
export function isGenericSectionSummary(activity: Pick<SavedActivity, 'title' | 'description'>): boolean {
  const blob = `${activity.title}\n${activity.description}`.toLowerCase();
  if (/\bunit recap\b/.test(blob)) return true;
  if (/each group owns one section/.test(blob)) return true;
  if (/section names on the board/.test(blob) && /real-life example/.test(blob)) return true;
  return (
    /meaning in simple words/.test(blob) &&
    /one line from the textbook/.test(blob) &&
    /real-life example/.test(blob)
  );
}

export function activityFitScore(activity: SavedActivity): number {
  if (isGenericSectionSummary(activity)) return 1;
  const text = `${activity.title} ${activity.description}`.toLowerCase();
  let score = activity.sliceKey ? 35 : 20;
  if (/letter|essay|diary|persuasive|argumentative|\bwrite\b|\bdraft\b/.test(text)) score += 25;
  else if (/debate|presentation|consensus|oral|role-play|role play|scenario/.test(text)) score += 22;
  else if (/modal|grammar|pronoun|conditional|indirect speech|preposition/.test(text)) score += 22;
  else if (/poem|helmet|civic/.test(text)) score += 18;
  return score;
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/["'“”]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP.has(word));
}

/** Overlap of instructional meaning, ignoring shared textbook quotes and filler words. */
export function meaningOverlap(left: string, right: string): number {
  const a = new Set(tokens(left));
  const b = new Set(tokens(right));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / new Set([...a, ...b]).size;
}

export function sameInstructionalPurpose(left: string, right: string): boolean {
  const a = left.replace(/\s+/g, ' ').trim().toLowerCase();
  const b = right.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  if (shorter.length > 40 && longer.includes(shorter)) return true;
  return meaningOverlap(left, right) >= 0.62;
}

export function periodBreakdown(totalMinutes: number): TimedBlock[] {
  const total = Math.max(20, Math.min(80, Math.round(totalMinutes) || 40));
  let intro = Math.max(4, Math.round(total * 0.125));
  let closing = Math.max(4, Math.round(total * 0.125));
  let sharing = Math.max(6, Math.round(total * 0.25));
  let main = total - intro - sharing - closing;
  if (main < 8) {
    const take = Math.min(8 - main, Math.max(0, sharing - 5));
    sharing -= take;
    main += take;
  }
  main += total - (intro + main + sharing + closing);
  return [
    { label: 'Introduction and instructions', minutes: intro },
    { label: 'Main activity', minutes: main },
    { label: 'Sharing and discussion', minutes: sharing },
    { label: 'Assessment and conclusion', minutes: closing },
  ];
}

function stepLines(activity: ActivityLike): string[] {
  const fromSteps = Array.isArray(activity.steps)
    ? activity.steps.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  if (fromSteps.length) return fromSteps.map((step) => step.trim());
  if (!Array.isArray(activity.teacherSteps)) return [];
  return activity.teacherSteps
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((step) => step.trim());
}

function youAddLine(participation: string): string | null {
  const match = participation.match(/you add:\s*(.+)$/i);
  const line = match?.[1]?.replace(/\s+/g, ' ').trim();
  return line && line.length > 8 ? line : null;
}

function sentences(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 24);
}

export function lessonActivityScript(activity: ActivityLike, periodMinutes: number): LessonActivityScript {
  const timing = periodBreakdown(periodMinutes);
  const storedObjective = activity.learningObjective?.trim() ?? '';
  const description = activity.description.trim();
  const storedSteps = stepLines(activity);
  const generic = isGenericSectionSummary(activity);
  const objective =
    storedObjective && !sameInstructionalPurpose(storedObjective, description)
      ? storedObjective
      : `Students can complete "${activity.title}" and show a result that matches this chapter's textbook task.`;

  const studentTask = generic
    ? `Each student completes one specific task from "${activity.title}" in their own notebook. They do not copy a group summary of every section.`
    : description;

  const correction = youAddLine(activity.participationTechnique);
  const storedAreDistinct =
    storedSteps.length >= 2 &&
    !sameInstructionalPurpose(storedSteps.join(' '), studentTask) &&
    !sameInstructionalPurpose(storedSteps.join(' '), objective);
  const teacherSteps = storedAreDistinct
    ? timing.map((block, index) => {
        const step =
          storedSteps[index] ??
          'Check which students still need a turn, then move to the textbook correction.';
        return `(${block.minutes} min) ${block.label}. ${step}`;
      })
    : [
        `(${timing[0].minutes} min) ${timing[0].label}. Name "${activity.title}" and the textbook section. Do not do the students' work for them.`,
        `(${timing[1].minutes} min) ${timing[1].label}. Move around the room. Every student must produce their own response before anyone speaks for a group.`,
        `(${timing[2].minutes} min) ${timing[2].label}. Hear a few results. ${
          correction ? `Correct with the textbook: ${correction}` : 'Correct one point from the textbook, not a new example.'
        }`,
        `(${timing[3].minutes} min) ${timing[3].label}. Check the learning objective against each student's own result.`,
      ];

  const participation = [
    activity.participationTechnique.trim(),
    'Every student produces an individual result before the class shares. Check each book or voice, not only a spokesperson.',
  ]
    .filter(Boolean)
    .join(' ');

  const storedOutcome = activity.expectedOutcome?.trim() ?? '';
  const expectedOutcome =
    storedOutcome && !/what did this activity ask you to do/i.test(storedOutcome)
      ? storedOutcome
      : `Each student has their own finished response for "${activity.title}" that can be checked against the textbook.`;
  const checkUnderstanding = sameInstructionalPurpose(expectedOutcome, objective)
    ? `Look at each student's own work for "${activity.title}". Accept it only when it matches the textbook task.`
    : `Look at each student's work. A successful result shows: ${expectedOutcome}`;

  return {
    learningObjective: objective,
    teacherSteps,
    studentTask,
    participation,
    checkUnderstanding,
    expectedOutcome,
    timing,
  };
}

export function collectActivityIssues(
  activities: ActivityLike[],
  chapterText?: string,
): string[] {
  const issues: string[] = [];
  const chapter = (chapterText ?? '').toLowerCase().replace(/\s+/g, ' ');
  activities.forEach((activity, index) => {
    const label = activity.title || `Activity ${index + 1}`;
    const steps = stepLines(activity).join(' ');
    const objective = activity.learningObjective?.trim() ?? '';
    const description = activity.description?.trim() ?? '';
    if (isGenericSectionSummary(activity)) {
      issues.push(`${label}: generic section-summary recap`);
    }
    if (objective && description && sameInstructionalPurpose(objective, description)) {
      issues.push(`${label}: learning objective repeats the student task`);
    }
    if (objective && steps && sameInstructionalPurpose(objective, steps)) {
      issues.push(`${label}: learning objective repeats the teacher instructions`);
    }
    if (description && steps && sameInstructionalPurpose(description, steps)) {
      issues.push(`${label}: teacher instructions repeat what students do`);
    }
    const seen = new Set<string>();
    for (const sentence of sentences(`${objective} ${description} ${steps}`)) {
      const key = sentence.toLowerCase();
      if (seen.has(key)) issues.push(`${label}: repeated sentence`);
      seen.add(key);
    }
    if (
      description &&
      !/\b(writ\w*|draft\w*|say\w*|speak\w*|present\w*|debat\w*|list\w*|choos\w*|perform\w*|explain\w*|compar\w*|read\w*|mark\w*|correct\w*|vot\w*|act\w*)\b/i.test(
        description,
      )
    ) {
      issues.push(`${label}: missing student action`);
    }
    const outcome = activity.expectedOutcome?.trim() ?? '';
    if (!outcome || /what did this activity ask you to do/i.test(outcome)) {
      issues.push(`${label}: missing assessment of learning`);
    }
    if (!activity.durationMinutes || activity.durationMinutes < 10 || activity.durationMinutes > 80) {
      issues.push(`${label}: missing or unrealistic duration`);
    }
    if (!/\b(each|every|own|individual|pair|pairs)\b/i.test(`${activity.participationTechnique} ${description}`)) {
      issues.push(`${label}: participation does not give each student a role`);
    }
    if (chapter) {
      const quotes = `${description} ${steps} ${activity.participationTechnique}`.match(/"([^"]{24,})"/g) ?? [];
      for (const quoted of quotes) {
        const phrase = quoted.slice(1, -1).toLowerCase().replace(/\s+/g, ' ');
        if (!chapter.includes(phrase)) issues.push(`${label}: quote is not in the chapter`);
      }
    }
  });
  const genericCount = activities.filter((activity) => isGenericSectionSummary(activity)).length;
  if (activities.length > 1 && genericCount === activities.length) {
    issues.push('Every activity is the same section-summary recap');
  }
  return issues;
}

export function assertActivityQuality(activities: ActivityLike[], chapterText?: string): void {
  const issues = collectActivityIssues(activities, chapterText);
  if (issues.length) {
    throw new Error(`Activity quality failed: ${issues.slice(0, 8).join('; ')}`);
  }
}
