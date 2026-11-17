import { meaningOverlap, sameInstructionalPurpose } from './activity-quality';

const CHECK_MARKER = '\n\nTeacher looks for: ';

type FocusActivity = {
  title: string;
  description: string;
  participationTechnique: string;
  materials?: string | null;
  learningObjective?: string | null;
  teacherSteps?: unknown;
  steps?: unknown;
  expectedOutcome?: string | null;
  checkUnderstanding?: string | null;
  durationMinutes?: number | null;
};

function stepLines(activity: FocusActivity): string[] {
  const fromSteps = Array.isArray(activity.steps)
    ? activity.steps.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  if (fromSteps.length) return fromSteps.map((step) => step.trim());
  if (!Array.isArray(activity.teacherSteps)) return [];
  return activity.teacherSteps
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((step) => step.trim());
}

function contentWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 4);
}

function sharedWords(left: string, right: string): number {
  const known = new Set(contentWords(left));
  return new Set(contentWords(right).filter((word) => known.has(word))).size;
}

function stepMinutes(step: string): number {
  const match = step.match(/^\(?\s*(\d+)\s*min(?:utes)?\)?\s*[.:\-]?\s*/i);
  return match ? Number(match[1]) : 0;
}

/** One classroom experience, sized to the period, with fields that do different jobs. */
export function collectClassroomFocusIssues(activity: FocusActivity, chapterText?: string): string[] {
  const issues: string[] = [];
  const label = activity.title || 'Activity';
  const description = activity.description?.trim() ?? '';
  const steps = stepLines(activity);
  const objective = activity.learningObjective?.trim() ?? '';
  const participation = activity.participationTechnique?.trim() ?? '';
  const outcome = activity.expectedOutcome?.trim() ?? '';
  const check = activity.checkUnderstanding?.trim() ?? '';
  const duration = activity.durationMinutes || 40;
  const teacherText = steps.join('\n');

  const parts = description.match(/\b(?:Part|Task)\s+(?:[A-E]|[1-5])\b/gi) ?? [];
  if (new Set(parts.map((part) => part.toLowerCase())).size >= 3) {
    issues.push(`${label}: more than one central task`);
  }

  const exercises = new Set(
    (description.match(/\bExercise\s+\d+/gi) ?? []).map((item) => item.toLowerCase().replace(/\s+/g, ' ')),
  );
  if (exercises.size >= 2) issues.push(`${label}: combines more than one textbook exercise`);

  const sideTasks = [
    /true\s*\/\s*false|true or false/i,
    /vocabular/i,
    /modal verb/i,
    /personal paragraph/i,
    /paper strips/i,
    /\bgrammar\b/i,
  ].filter((pattern) => pattern.test(description));
  if (sideTasks.length >= 2) issues.push(`${label}: several unrelated exercises are packed into one activity`);

  if (steps.length < 3 || steps.length > 5) {
    issues.push(`${label}: use 3 to 5 teacher steps for this period`);
  }
  const minutes = steps.map(stepMinutes);
  if (minutes.some((minute) => minute <= 0)) {
    issues.push(`${label}: every step needs its minutes`);
  } else if (minutes.reduce((sum, minute) => sum + minute, 0) !== duration) {
    issues.push(`${label}: step minutes do not add up to ${duration}`);
  }

  if (
    !/\b(decid|defend|judg|argu|reconstruct|challeng|compet|court|role|team|group|evidence|solv|demonstrat|creat|build|rank|simul|choos|compar|writ|draft|letter|speak|present)/i.test(
      description,
    )
  ) {
    issues.push(`${label}: students are not asked to decide, create, defend, or solve something`);
  }

  if (objective && sameInstructionalPurpose(objective, description)) {
    issues.push(`${label}: objective repeats the student task`);
  }
  if (objective && sharedWords(objective, `${activity.title} ${description}`) < 1) {
    issues.push(`${label}: objective is not about this activity`);
  }
  if (/skim|pre-reading|read silently|revise and apply|infer themes/i.test(objective)) {
    issues.push(`${label}: objective copies a syllabus line instead of the activity`);
  }

  const flow = `${description}\n${teacherText}`;
  const worksAlone = /\b(on your own|individually|without (a )?partner|no group)\b/i.test(description);
  const groupDecides = /\b(the group (decides|agrees|submits)|one (group|team) answer|groups? decide)\b/i.test(flow);
  const sequenced = /\b(then|after|next|once|when (they|you|the groups) finish)\b/i.test(flow);
  if (worksAlone && groupDecides && !sequenced) {
    issues.push(`${label}: individual work and a group decision have no transition`);
  }

  if (participation && sameInstructionalPurpose(participation, description)) {
    issues.push(`${label}: participation repeats the student task`);
  }
  if (outcome && sameInstructionalPurpose(outcome, description)) {
    issues.push(`${label}: expected outcome repeats the student task`);
  }
  if (!check) issues.push(`${label}: missing a check of understanding`);
  if (check && outcome && (sameInstructionalPurpose(check, outcome) || meaningOverlap(check, outcome) >= 0.55)) {
    issues.push(`${label}: check understanding repeats the expected outcome`);
  }
  const sizes = [...`${description}\n${participation}`.matchAll(/\b(?:groups?|teams?) of\s+(\d+)/gi)].map((match) =>
    Number(match[1]),
  );
  if (sizes.some((size) => size < 2 || size > 6)) {
    issues.push(`${label}: group size does not fit a 40-minute class`);
  }

  const asksTeacherToInvent =
    /\b(prepare|create|invent|make up|write) (?:a |the |your )?(?:own )?(?:case|scenario|slips?|cards?|questions)\b/i.test(
      `${description}\n${activity.materials ?? ''}`,
    );
  const suppliesMaterial = /fictional scenario|example (argument|answer|question)|facts:|the case\b|roles?:/i.test(
    description,
  );
  if (asksTeacherToInvent && !suppliesMaterial) {
    issues.push(`${label}: the teacher still has to invent the case, cards, or questions`);
  }

  if (chapterText) {
    const chapter = chapterText.toLowerCase();
    const found = new Set(contentWords(description).filter((word) => chapter.includes(word)));
    if (found.size < 3) issues.push(`${label}: the activity does not use specific chapter material`);
  }

  return issues;
}

export function activitiesRepeatEachOther(activities: FocusActivity[]): string | null {
  for (let index = 0; index < activities.length; index += 1) {
    for (let later = index + 1; later < activities.length; later += 1) {
      if (meaningOverlap(activities[index].description, activities[later].description) >= 0.45) {
        return `${activities[index].title} and ${activities[later].title} are the same experience`;
      }
    }
  }
  return null;
}

export function storedExpectedOutcome(activity: {
  expectedOutcome: string;
  checkUnderstanding?: string | null;
}): string {
  const outcome = activity.expectedOutcome.trim();
  const check = activity.checkUnderstanding?.trim();
  if (!check || outcome.includes(CHECK_MARKER.trim())) return outcome;
  return `${outcome}${CHECK_MARKER}${check}`;
}

export function splitStoredOutcome(value: string): { outcome: string; check: string | null } {
  const index = value.indexOf(CHECK_MARKER);
  if (index === -1) return { outcome: value.trim(), check: null };
  return {
    outcome: value.slice(0, index).trim(),
    check: value.slice(index + CHECK_MARKER.length).trim() || null,
  };
}
