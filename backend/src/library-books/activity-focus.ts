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

const NUMBER_WORDS: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

function wordToCount(token: string | undefined): number | null {
  if (!token) return null;
  if (/^\d+$/.test(token)) return Number(token);
  return NUMBER_WORDS[token.toLowerCase()] ?? null;
}

function groupSizeBounds(text: string): { min: number; max: number } | null {
  const match = text.match(
    /\b(?:groups?|teams?) of\s+(\d+|[a-z]+)(?:\s+(?:or|to)\s+(\d+|[a-z]+))?/i,
  );
  if (!match) return null;
  const first = wordToCount(match[1]);
  const second = wordToCount(match[2]);
  if (first == null) return null;
  const values = [first, second].filter((value): value is number => value != null && value > 0);
  return { min: Math.min(...values), max: Math.max(...values) };
}

function namedRoleCount(text: string): number | null {
  const match = text.match(/\broles?\s*:\s*([^.\n]+)/i);
  if (!match) return null;
  const parts = match[1]
    .split(/,|\band\b/i)
    .map((part) => part.replace(/\([^)]*\)/g, '').trim())
    .filter((part) => part.length > 1);
  return parts.length >= 2 ? parts.length : null;
}

const RESTAGE =
  /\breplay the\b|\breconstruction of\b|\bact out the court\b|\bact out the textbook\b|\breconstruct the\b|\bstopping before\b/i;
const HARD_CARD_WORD =
  /\b(prudence|prudent|reconstruction|testimony|moderated|injudicious|mitigat\w*)\b/i;
const EXTRA_TASK = /\bwrite a motto\b|\bcollect slips\b|\bread tomorrow\b|\b1\s*[-–to]+\s*9\b/i;
const EXAMPLE_ANSWER = /\bexample\s+(answer|argument|verdict|question|decision)\b|\bexample\s*:/i;
const STUDENT_ACTION = /\b(decid\w*|defend\w*|advis\w*|keep|limit|stop|writ\w*|perform\w*|judg\w*)\b/i;

/** A card a teacher can run: one finished case, not a padded chapter summary. */
export function collectActivityCardIssues(activity: FocusActivity): string[] {
  const issues: string[] = [];
  const label = activity.title || 'Activity';
  const description = activity.description?.trim() ?? '';
  const steps = stepLines(activity);
  const card = `${activity.title}\n${description}\n${steps.join('\n')}\n${activity.participationTechnique ?? ''}`;
  const length = description.length;

  if (length < 180 || length > 900) {
    issues.push(`${label}: description must be a short complete case, about 180 to 900 characters`);
  }
  if (!STUDENT_ACTION.test(description)) {
    issues.push(`${label}: students are not asked to decide, defend, advise, or write`);
  }
  if (!EXAMPLE_ANSWER.test(description)) {
    issues.push(`${label}: missing an example answer`);
  }
  if (steps.length < 3 || steps.length > 4) {
    issues.push(`${label}: use 3 or 4 teacher steps for this period`);
  }
  if (RESTAGE.test(card)) {
    issues.push(`${label}: do not replay or reconstruct the textbook scene`);
  }
  if (HARD_CARD_WORD.test(`${activity.title}\n${description}`) || /\bkeep moderated\b/i.test(description)) {
    issues.push(`${label}: use simple classroom words and finish every sentence`);
  }
  if (!/[.!?]/.test(description.slice(-80)) || !/[.!?]"?\s*$/.test(description)) {
    issues.push(`${label}: the description ends in an unfinished sentence`);
  }
  if (EXTRA_TASK.test(card)) {
    issues.push(`${label}: do not add a motto, a worksheet, or slips for tomorrow`);
  }
  const roles = namedRoleCount(`${description}\n${activity.participationTechnique ?? ''}`);
  const size = groupSizeBounds(`${description}\n${activity.participationTechnique ?? ''}`);
  if (roles != null && size && (roles < size.min || roles > size.max)) {
    issues.push(`${label}: named roles do not match the group size`);
  }
  return issues;
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

  issues.push(...collectActivityCardIssues(activity));

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

  const minutes = steps.map(stepMinutes);
  if (minutes.some((minute) => minute <= 0)) {
    issues.push(`${label}: every step needs its minutes`);
  } else if (minutes.reduce((sum, minute) => sum + minute, 0) !== duration) {
    issues.push(`${label}: step minutes do not add up to ${duration}`);
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
