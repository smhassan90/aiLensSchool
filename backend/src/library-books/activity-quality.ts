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

type ActivityLike = {
  sliceKey?: string | null;
  title: string;
  description: string;
  participationTechnique: string;
  materials?: string | null;
  learningObjective?: string | null;
  teacherSteps?: unknown;
  steps?: unknown;
  expectedOutcome?: string | null;
  durationMinutes?: number | null;
};

/** The stock "each group owns one section" recap. A real chapter task is not this. */
export function isGenericSectionSummary(activity: Pick<ActivityLike, 'title' | 'description'>): boolean {
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

export function activityFitScore(activity: ActivityLike): number {
  if (isGenericSectionSummary(activity)) return 1;
  const text = `${activity.title} ${activity.description}`.toLowerCase();
  let score = activity.sliceKey ? 35 : 20;
  if (/letter|essay|diary|persuasive|argumentative/.test(text)) score += 25;
  else if (/debate|presentation|consensus|oral|speech|role-play|role play|scenario/.test(text)) score += 22;
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
  const line = match?.[1]?.replace(/^["“]+|["”]+$/g, '').replace(/\s+/g, ' ').trim();
  return line && line.length > 8 ? line : null;
}

function mistakeLine(participation: string): string | null {
  const match = participation.match(/student might say:\s*(.+?)\s+you add:/i);
  const line = match?.[1]?.replace(/^["“]+|["”]+$/g, '').replace(/\s+/g, ' ').trim();
  return line && line.length > 8 ? line : null;
}

type ActivityKind =
  | 'letter'
  | 'diary'
  | 'debate'
  | 'presentation'
  | 'speech'
  | 'poem'
  | 'essay'
  | 'grammar'
  | 'discussion'
  | 'task';

function activityKind(activity: Pick<ActivityLike, 'title' | 'description'>): ActivityKind {
  const text = `${activity.title} ${activity.description}`.toLowerCase();
  if (/\bletter\b/.test(text)) return 'letter';
  if (/\bdiary\b/.test(text)) return 'diary';
  if (/\bdebate\b/.test(text)) return 'debate';
  if (/presentation|feedback/.test(text)) return 'presentation';
  if (/\bspeech\b|cue card/.test(text)) return 'speech';
  if (/\bpoem\b|\bverse\b/.test(text)) return 'poem';
  if (/essay|persuasive|argumentative/.test(text)) return 'essay';
  if (/modal|grammar|pronoun|conditional|preposition|indirect speech/.test(text)) return 'grammar';
  if (/consensus|discuss|oral/.test(text)) return 'discussion';
  return 'task';
}

function objectiveFor(kind: ActivityKind, title: string): string {
  switch (kind) {
    case 'letter':
      return 'Students can organise a letter to the editor so a reader sees one public concern and a clear opinion.';
    case 'diary':
      return 'Students can record a personal experience in a diary, in the first person, with the day and date.';
    case 'debate':
      return 'Students can defend one side of the chapter issue and answer the other side without interrupting.';
    case 'presentation':
      return 'Students can judge a short talk against a criterion, not only say that it was good or bad.';
    case 'speech':
      return 'Students can give a short talk from key words on cue cards, with a clear opening and ending.';
    case 'poem':
      return 'Students can perform one verse and say what that part of the poem claims.';
    case 'essay':
      return `Students can plan "${title}" so the writing makes a point and answers the opposite view.`;
    case 'grammar':
      return `Students can use the grammar in "${title}" correctly in sentences they write themselves.`;
    case 'discussion':
      return 'Students can use the polite phrases from this section to reach an agreement.';
    default:
      return `Students can use a fact from "${title}" in work of their own.`;
  }
}

function outcomeFor(kind: ActivityKind, title: string): string {
  switch (kind) {
    case 'letter':
      return 'Each notebook has a letter with the date, a salutation, one concern, an opinion, and the student\'s name.';
    case 'diary':
      return 'Each notebook has one diary entry with the day, the date, and first-person sentences.';
    case 'debate':
      return 'Every student has spoken one reason for their side, and the leaders have answered the other side.';
    case 'presentation':
      return 'Every listener has written one comment that names the criterion.';
    case 'speech':
      return 'Each student has spoken a short talk from three cue cards that contain key words, not full sentences.';
    case 'poem':
      return 'Every student has spoken one verse and one sentence about what that verse claims.';
    case 'essay':
      return `Each notebook has a plan for "${title}" with a thesis and one answer to the opposite view.`;
    case 'grammar':
      return `Each notebook has the student's own sentences for "${title}", following the textbook pattern.`;
    case 'discussion':
      return 'Each student has spoken once, using a phrase from the section, before the group states its agreement.';
    default:
      return `Each notebook shows that student's own answer for "${title}".`;
  }
}

function openingFor(kind: ActivityKind, title: string): string {
  switch (kind) {
    case 'letter':
      return 'Show a short letter from the textbook. Point to the date, the greeting, the concern, and the opinion.';
    case 'diary':
      return 'Read one diary entry from the chapter. Point to the date and a sentence that uses "I".';
    case 'debate':
      return 'Write the motion on the board, assign the two sides, and read the debate rules once.';
    case 'presentation':
      return 'Put the criterion on the board and show one respectful comment before the talks start.';
    case 'speech':
      return 'Show one cue card with key words, not a full sentence, and say the opening sentence of a model talk.';
    case 'poem':
      return 'Read one verse yourself, then say in one sentence what that speaker thinks.';
    case 'essay':
      return `Write the paragraph jobs for "${title}" on the board before anyone starts writing.`;
    case 'grammar':
      return `Write one correct example for "${title}" and underline the word that carries the pattern.`;
    case 'discussion':
      return 'Put two polite phrases from this section on the board before the groups begin.';
    default:
      return `Read the textbook instruction for "${title}" once. Tell the class the work is individual.`;
  }
}

function watchFor(kind: ActivityKind, title: string): string {
  switch (kind) {
    case 'letter':
      return 'Tick date, salutation, concern, opinion, and name in every notebook. Send back a letter that is only a story.';
    case 'diary':
      return 'Check that each entry has a date and uses "I", not a list of place names.';
    case 'debate':
      return 'Give every speaker one turn. Stop interruptions. Note one textbook point each speaker uses.';
    case 'presentation':
      return 'Put the criterion on the board, time each pair, and collect one written comment from every listener.';
    case 'speech':
      return 'Each student writes three cards, then speaks. Send back a card that is a full sentence.';
    case 'poem':
      return 'Give each student one verse. Listen for the meaning, not only for a loud voice.';
    case 'essay':
      return `Name the paragraph jobs for "${title}" on the board. Check each plan for a thesis and one answer to the other view.`;
    case 'grammar':
      return `Write one textbook model for "${title}" on the board. Mark the pattern in each student's own sentences.`;
    case 'discussion':
      return 'Each person speaks before the group announces an agreement. Do not let one student speak for the others.';
    default:
      return 'Check every notebook. Do not accept one answer spoken by a group spokesperson.';
  }
}

function roleLine(description: string, kind: ActivityKind): string {
  if (kind === 'speech') {
    return 'Each student prepares their own cue cards and gives their own talk. Nobody reads another student\'s cards.';
  }
  if (/\bdebate\b|for and against|split the class/i.test(description)) {
    return 'The class splits into two sides. Each student prepares one point and speaks once. A leader may close, but does not speak instead of the others.';
  }
  const sized = description.match(/groups of (\d+)/i);
  if (sized) return `Groups of ${sized[1]}. Each student adds one point of their own before anyone reports for the group.`;
  if (/\bpairs\b/i.test(description)) {
    return 'In pairs, each student writes an answer first, then checks the partner\'s page.';
  }
  if (/\bgroups\b/i.test(description)) {
    return 'In the group, each student adds one point of their own before the group shares.';
  }
  return 'Each student works in their own notebook. There is no group answer.';
}

function studentFacing(kind: ActivityKind, description: string): string {
  const teacherVoiced = /\b(give \d+ minutes|you act|split the class|assign )\b/i.test(description);
  if (!teacherVoiced) return description;
  if (kind === 'debate') {
    const motion = description.match(/motion that ([^.]+)/i)?.[1]?.trim();
    const motionText = motion ? `the motion that ${motion}` : 'the motion';
    return `Take one side of ${motionText}. List points from the textbook, speak once when it is your turn, and do not interrupt. Leaders answer the other side.`;
  }
  return description;
}

function shareFor(kind: ActivityKind, correction: string | null): string {
  const fix = correction ? ` If someone makes the common mistake, add: ${correction}` : '';
  if (kind === 'debate') return `The leaders answer the other side.${fix}`;
  if (kind === 'diary') return `Ask two students to read the sentence that shows a feeling.${fix}`;
  if (kind === 'letter') return `Ask two students to read only the opinion sentence.${fix}`;
  if (kind === 'speech') return `Hear two talks. Look at the cards while the student speaks.${fix}`;
  return `Hear two or three students.${fix}`;
}

function closeFor(kind: ActivityKind): string {
  switch (kind) {
    case 'debate':
      return 'Check the list of speakers. Call on any student who has not spoken.';
    case 'letter':
      return 'A letter with no opinion goes back to the student before the period ends.';
    case 'diary':
      return 'A page with no date, or with no sentence using "I", is not finished.';
    case 'speech':
      return 'Call on any student who has not spoken. A card written in full sentences is not ready.';
    default:
      return 'Look at each student\'s own page or turn before you end the lesson.';
  }
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
  const kind = activityKind(activity);
  const derivedObjective = objectiveFor(kind, activity.title);
  const objective =
    storedObjective &&
    !sameInstructionalPurpose(storedObjective, description) &&
    !sameInstructionalPurpose(storedObjective, derivedObjective)
      ? storedObjective
      : derivedObjective;

  const studentTask = generic
    ? `Each student completes one specific task from "${activity.title}" in their own notebook. They do not copy a group summary of every section.`
    : studentFacing(kind, description);

  const correction = youAddLine(activity.participationTechnique);
  const mistake = mistakeLine(activity.participationTechnique);
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
        `(${timing[0]!.minutes} min) ${timing[0]!.label}. ${openingFor(kind, activity.title)}${
          kind === 'debate' || kind === 'speech' ? '' : ' Do not write the students\' answers.'
        }`,
        `(${timing[1]!.minutes} min) ${timing[1]!.label}. ${watchFor(kind, activity.title)}`,
        `(${timing[2]!.minutes} min) ${timing[2]!.label}. ${shareFor(kind, correction)}`,
        `(${timing[3]!.minutes} min) ${timing[3]!.label}. ${closeFor(kind)}`,
      ];

  const participation = [
    roleLine(description, kind),
    activity.participationTechnique.trim(),
    'Every student produces an individual result before the class shares. Check each book or voice, not only a spokesperson.',
  ]
    .filter(Boolean)
    .join(' ');

  const storedOutcome = activity.expectedOutcome?.trim() ?? '';
  const derivedOutcome = outcomeFor(kind, activity.title);
  const expectedOutcome =
    storedOutcome &&
    !/what did this activity ask you to do/i.test(storedOutcome) &&
    !sameInstructionalPurpose(storedOutcome, objective) &&
    !sameInstructionalPurpose(storedOutcome, studentTask)
      ? storedOutcome
      : derivedOutcome;
  const checkUnderstanding = mistake
    ? `Ask one student to show their own work, then ask the class: "${mistake}" What does the textbook say instead?`
    : `Ask two students to point to the part of their own work that shows they can do "${activity.title}".`;

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
