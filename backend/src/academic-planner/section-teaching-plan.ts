import { splitCompiledChapter } from '../ai/schemas/chapter-compile-text';

export type SectionSkill = 'READING' | 'ORAL' | 'LANGUAGE' | 'WRITING' | 'STUDY' | 'FUN' | 'OTHER';

export type ExerciseGrouping = 'individual' | 'pairs' | 'groups';

export type SectionExercise = {
  key: string;
  number: string;
  instruction: string;
  teacherNote: string | null;
  items: string[];
  grouping: ExerciseGrouping;
  groupSize: number | null;
};

export type SectionPlan = {
  sliceKey: string;
  title: string;
  skill: SectionSkill;
  learningObjective: string;
  contentPoints: string[];
  anchor: string;
  exercises: SectionExercise[];
};

export type ChapterDayAssignment = {
  mode: 'teach' | 'practice' | 'activity';
  section: SectionPlan;
  exercise: SectionExercise | null;
  /** Extra day after every printed exercise has a slot. Continues practice without reteaching. */
  application?: boolean;
};

const SKILL_PRIORITY: SectionSkill[] = ['READING', 'ORAL', 'LANGUAGE', 'WRITING', 'STUDY', 'FUN', 'OTHER'];

const HEADING =
  /(?:^|\n)\s*(?:Unit\s+)?(READING COMPREHENSION|ORAL COMMUNICATION|LANGUAGE PRACTICE|WRITING|STUDY SKILLS|FUN)\s+(\d+\.\d+)/gi;

export function teacherGuideBullets(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  if (value && typeof value === 'object' && Array.isArray((value as { bullets?: unknown }).bullets)) {
    return teacherGuideBullets((value as { bullets: unknown }).bullets);
  }
  return [];
}

export function readSectionPlans(teacherGuide: unknown): SectionPlan[] {
  if (!teacherGuide || typeof teacherGuide !== 'object' || Array.isArray(teacherGuide)) return [];
  const plans = (teacherGuide as { sectionPlans?: unknown }).sectionPlans;
  if (!Array.isArray(plans)) return [];
  return plans.filter(isSectionPlan);
}

export function wrapTeacherGuide(bullets: string[], sectionPlans: SectionPlan[]): {
  bullets: string[];
  sectionPlans: SectionPlan[];
} {
  return { bullets, sectionPlans };
}

export function parseSectionPlans(chapterText: string): SectionPlan[] {
  const { lessonBody, exercises } = splitCompiledChapter(chapterText);
  const lessonSections = splitByHeading(lessonBody);
  const exerciseSections = splitByHeading(exercises);
  // Some units print only the reading passage in the lesson and put Oral, Language,
  // Writing, Study, and Fun headings on the exercise pages.
  const sections =
    lessonSections.length >= 2 ? lessonSections : mergeHeadingSections(lessonSections, exerciseSections);
  if (sections.length < 2) return [];

  const outcomes = learningOutcomes(lessonBody);
  return sections.map((section, index) => {
    const skill = skillOf(section.heading);
    const exerciseChunk =
      exerciseSections.find((item) => item.heading === section.heading)?.body ??
      (index === 0 ? exercises.split(HEADING)[0] || section.body : section.body);
    const exercisesForSection = parseExercises(exerciseChunk, `s${index + 1}`);
    const objective =
      outcomes[skill] ||
      `Students complete the printed work for ${section.heading} ${section.number}.`;
    return {
      sliceKey: `s${index + 1}`,
      title: `${titleCase(section.heading)} ${section.number}`,
      skill,
      learningObjective: clip(objective, 240),
      contentPoints: contentPoints(section.body),
      anchor: anchorFrom(section.body, section.heading),
      exercises: exercisesForSection,
    };
  });
}

export function allocateSectionDays(dayCount: number, sections: SectionPlan[]): ChapterDayAssignment[] {
  const count = Math.max(0, Math.floor(dayCount));
  if (!count || !sections.length) return [];
  if (count === 1) {
    return [{ mode: 'teach', section: sections[0]!, exercise: sections[0]!.exercises[0] ?? null }];
  }

  const teachSlots = count - 1;
  const ranked = [...sections].sort((left, right) => {
    const skillOrder = SKILL_PRIORITY.indexOf(left.skill) - SKILL_PRIORITY.indexOf(right.skill);
    if (skillOrder !== 0) return skillOrder;
    return sections.indexOf(left) - sections.indexOf(right);
  });
  const chosen = ranked
    .slice(0, Math.min(teachSlots, sections.length))
    .sort((left, right) => sections.indexOf(left) - sections.indexOf(right));

  const jobs: ChapterDayAssignment[] = [];
  for (const section of chosen) {
    jobs.push({ mode: 'teach', section, exercise: section.exercises[0] ?? null });
  }
  const practice: ChapterDayAssignment[] = [];
  const queues = chosen.map((section) => practiceOrder(section));
  let added = true;
  while (added) {
    added = false;
    queues.forEach((queue, index) => {
      const exercise = queue.shift();
      if (!exercise) return;
      practice.push({ mode: 'practice', section: chosen[index]!, exercise });
      added = true;
    });
  }
  while (jobs.length < teachSlots && practice.length) {
    jobs.push(practice.shift()!);
  }
  let practiceCursor = 0;
  while (jobs.length < teachSlots && chosen.length) {
    const section = chosen[practiceCursor % chosen.length]!;
    const exercise = section.exercises[practiceCursor % Math.max(1, section.exercises.length)] ?? null;
    jobs.push({ mode: 'practice', section, exercise, application: true });
    practiceCursor += 1;
    if (practiceCursor > teachSlots + chosen.length) break;
  }

  const used = new Set(jobs.map((job) => job.exercise?.key).filter((key): key is string => Boolean(key)));
  const activity = chooseActivity(chosen, used);
  return [...jobs.slice(0, teachSlots), activity];
}

export function renderAssignedLesson(
  assignment: ChapterDayAssignment,
  periodMinutes: number,
): { objective: string; notes: string; titleSuffix: string; kind: 'TEACHING' | 'ACTIVITY' } {
  const minutes = normalizeBlocks(periodMinutes);
  if (assignment.mode === 'activity') {
    return renderActivity(assignment, minutes);
  }
  return renderLecture(assignment, minutes);
}

export function validateDisplayedLesson(notes: string, periodMinutes: number): string[] {
  const issues: string[] = [];
  const timed = [...notes.matchAll(/\((\d+)\s*min\)/g)].map((match) => Number(match[1]));
  const listed = [...notes.matchAll(/^- .+:\s*(\d+)\s+minutes\./gm)].map((match) => Number(match[1]));
  const parts = timed.length ? timed : listed;
  if (!parts.length) issues.push('missing time breakdown');
  else if (parts.reduce((sum, value) => sum + value, 0) !== periodMinutes) {
    issues.push('time breakdown does not match the period');
  }
  if (/say one fact from this section/i.test(notes)) issues.push('generic fact-recall assessment');
  if (/read (?:the |this )?section heading/i.test(notes)) issues.push('reading a heading is the task');
  const teacherBlock = notes.split('What the teacher does:')[1]?.split('What students do:')[0] ?? notes;
  const studentBlock = notes.split('What students do:\n')[1]?.split('\n\n')[0] ?? '';
  const participationBlock = notes.split('How every student participates:')[1]?.split('\n\n')[0] ?? '';
  const conduct = `${teacherBlock}\n${studentBlock}\n${participationBlock}`;
  const groupWork = /\bgroups of\b|\bin groups\b|\bin pairs\b|\bhalf the class\b/i.test(conduct);
  const soloBan = /no group answer|work individually with no group/i.test(conduct);
  if (groupWork && soloBan) issues.push('group work contradicts individual work');
  const teacher = notes.split('What the teacher does:')[1]?.split('What students do:')[0] ?? '';
  const students = notes.split('What students do:\n')[1]?.split('\n\n')[0] ?? '';
  if (teacher && students && collapse(teacher) === collapse(students)) {
    issues.push('student instructions repeat teacher instructions');
  }
  const objective = notes.match(/Learning objective:\s*(.+)/)?.[1] ?? '';
  const check = notes.split('Check understanding:\n')[1]?.split('\nExpected outcome:')[0] ?? '';
  const objectiveExercise = objective.match(/exercise\s+(\d+)/i)?.[1];
  const checkExercise = check.match(/exercise\s+(\d+)/i)?.[1];
  if (objectiveExercise && checkExercise && objectiveExercise !== checkExercise) {
    issues.push('assessment does not match the learning objective');
  }
  if (/students will understand the topic|learn about the section/i.test(notes)) issues.push('vague outcome');
  return issues;
}

export function packNeedsRefresh(input: {
  storedHash: string | null;
  storedPromptVersion: string | null;
  contentHash: string;
  promptVersion: string;
}): boolean {
  if (!input.storedHash || input.storedHash !== input.contentHash) return true;
  return input.storedPromptVersion !== input.promptVersion;
}

function renderLecture(
  assignment: ChapterDayAssignment,
  blocks: Timed[],
): { objective: string; notes: string; titleSuffix: string; kind: 'TEACHING' } {
  const { section, exercise, mode } = assignment;
  const objective = section.learningObjective;
  const practice = exercise
    ? studentPractice(section, exercise)
    : 'Answer one question printed in this section, in your notebook.';
  const check = assessmentFor(section, exercise);
  const opening = assignment.application
    ? `This is an application lesson. Do not repeat the section explanation.`
    : mode === 'practice'
      ? `Remind the class of the objective in one sentence. Do not reteach ${section.title}.`
      : openingFor(section);
  const explanation = assignment.application
    ? `Students use ${section.title} on a new item from the textbook. Do not repeat the section explanation.`
    : mode === 'practice'
      ? `Point at the textbook instruction for ${exercise ? `Exercise ${exercise.number}` : section.title}. Do not repeat the full explanation.`
      : section.contentPoints.map((point, index) => `${index + 1}. ${point}`).join(' ') ||
        `Explain the main idea of ${section.title} from the textbook.`;
  const guided = exercise
    ? `Do the first item of Exercise ${exercise.number} with the class: ${clip(exercise.items[0] || exercise.instruction, 180)}`
    : `Show one example from ${section.title} on the board.`;
  const notes = [
    `Learning objective: ${objective}`,
    'Duration: ' + blocks.reduce((sum, block) => sum + block.minutes, 0) + ' minutes',
    ...blocks.map((block) => `- ${block.label}: ${block.minutes} minutes.`),
    '',
    'What the teacher does:',
    `1. (${blocks[0]!.minutes} min) ${blocks[0]!.label}. ${opening}`,
    `2. (${blocks[1]!.minutes} min) ${blocks[1]!.label}. ${explanation}`,
    `3. (${blocks[2]!.minutes} min) ${blocks[2]!.label}. ${guided}`,
    `4. (${blocks[3]!.minutes} min) ${blocks[3]!.label}. ${practice}`,
    `5. (${blocks[4]!.minutes} min) ${blocks[4]!.label}. ${check}`,
    '',
    'What students do:',
    practice,
    '',
    'How every student participates:',
    participationFor(exercise),
    '',
    'Check understanding:',
    check,
    `Expected outcome: ${outcomeFor(section, exercise)}`,
    exercise?.teacherNote ? `Textbook note: ${clip(exercise.teacherNote, 280)}` : '',
  ]
    .filter((line) => line !== '')
    .join('\n');
  return {
    objective,
    notes,
    titleSuffix: assignment.application
      ? `${section.title} application`
      : mode === 'practice'
        ? `${section.title} practice`
        : section.title,
    kind: 'TEACHING',
  };
}

function renderActivity(
  assignment: ChapterDayAssignment,
  blocks: Timed[],
): { objective: string; notes: string; titleSuffix: string; kind: 'ACTIVITY' } {
  const { section } = assignment;
  const total = blocks.reduce((sum, block) => sum + block.minutes, 0);
  const objective = section.learningObjective;
  const notes = [
    `Learning objective: ${objective}`,
    `Duration: ${total} minutes`,
    '',
    'What the teacher does:',
    `1. (${total} min) Teach one application of ${section.title} from the textbook. Do not replace it with a different exercise.`,
    '',
    'What students do:',
    `Complete that one application from ${section.title}.`,
    '',
    'How every student participates:',
    'Each student finishes their own part of that application.',
    '',
    'Check understanding:',
    'Accept only an answer the textbook supports.',
    `Expected outcome: Each student has finished one application from ${section.title}.`,
  ].join('\n');
  return { objective, notes, titleSuffix: section.title, kind: 'ACTIVITY' };
}

function practiceOrder(section: SectionPlan): SectionExercise[] {
  const rest = section.exercises.slice(1);
  if (section.skill !== 'LANGUAGE') return rest;
  const prefix = rest.filter((exercise) => /prefix|suffix/i.test(`${exercise.instruction} ${exercise.items.join(' ')}`));
  const other = rest.filter((exercise) => !prefix.includes(exercise));
  return [other[0], prefix[0], ...other.slice(1), ...prefix.slice(1)].filter(
    (exercise): exercise is SectionExercise => Boolean(exercise),
  );
}

function chooseActivity(sections: SectionPlan[], used: Set<string>): ChapterDayAssignment {
  for (const section of sections) {
    const exercise = section.exercises.find((item) => !used.has(item.key));
    if (exercise) return { mode: 'activity', section, exercise };
  }
  const section = sections[0]!;
  return { mode: 'activity', section, exercise: section.exercises[0] ?? null };
}

function groupingLead(exercise: SectionExercise): string {
  if (/groups?\s+of|\bin groups\b|\bin pairs\b|\bwork individually\b|\byour own notebook\b/i.test(exercise.instruction)) {
    return '';
  }
  if (exercise.grouping === 'groups') return `Work in groups of ${exercise.groupSize ?? 3}. `;
  if (exercise.grouping === 'pairs') return 'Work in pairs. ';
  return 'Work on your own. ';
}

function studentPractice(_section: SectionPlan, exercise: SectionExercise): string {
  const instruction = clip(exercise.instruction.replace(/^(?:Exercise\s+\d+|B\.\s*Exercise)\s*/i, ''), 420);
  const first = exercise.items[0] ?? '';
  const already = first.length > 12 && exercise.instruction.includes(first.slice(0, 24));
  const item = first && !already ? ` Start with: ${clip(first, 140)}` : '';
  const note = exercise.teacherNote ? ` ${clip(exercise.teacherNote, 180)}` : '';
  return `${groupingLead(exercise)}${instruction}${item}${note}`.replace(/\s+/g, ' ').trim();
}

function teacherLeads(_section: SectionPlan, exercise: SectionExercise): string {
  const first = exercise.items[0] ? ` The first item is: ${clip(exercise.items[0], 120)}` : '';
  return `Read the instruction for Exercise ${exercise.number}. Complete the first item with the class.${first}`;
}

function openingFor(section: SectionPlan): string {
  if (section.skill === 'READING') {
    return 'Ask one question students can answer from their own experience, then open the text. Do not ask students to read the heading aloud as the lesson.';
  }
  if (section.skill === 'LANGUAGE') {
    return 'Write one item from the exercise and ask what is wrong, before stating the rule.';
  }
  if (section.skill === 'WRITING') {
    return 'Read the model in the textbook once, then name the exercise the class will write.';
  }
  if (section.skill === 'FUN') {
    return 'Read the task once, then tell students how they will share the result.';
  }
  return 'Ask one question students can answer from their own experience, then open this section. Do not ask students to read the heading aloud as the lesson.';
}

function statedProduct(text: string): 'essay' | 'rubric' | 'experiment' | null {
  if (/\bessay\b/i.test(text)) return 'essay';
  if (/\brubric\b/i.test(text)) return 'rubric';
  if (/\bexperiment\b/i.test(text)) return 'experiment';
  return null;
}

function assessmentFor(section: SectionPlan, exercise: SectionExercise | null): string {
  const blob = `${exercise?.instruction ?? ''} ${(exercise?.items ?? []).join(' ')}`;
  const product = statedProduct(blob);
  if (product === 'essay') return 'Read one essay plan. Accept it when it has a claim, reasons, and an answer to the other side.';
  if (product === 'rubric') return 'Check one row of the rubric. Accept a mark only when the student can say why.';
  if (product === 'experiment') return 'Check the recorded result. Accept it when it follows the printed steps.';
  return exercise
    ? `Check the class against Exercise ${exercise.number}. Accept answers the textbook supports.`
    : `Check the work against ${section.title}.`;
}

function outcomeFor(section: SectionPlan, exercise: SectionExercise | null): string {
  const blob = `${exercise?.instruction ?? ''} ${(exercise?.items ?? []).join(' ')}`;
  const product = statedProduct(blob);
  if (product === 'essay') return 'Each student has a claim, reasons, and a response to the other side.';
  if (product === 'rubric') return 'Each student has marked the rubric and can explain one mark.';
  if (product === 'experiment') return 'Each student has the experiment result the instructions ask for.';
  return exercise
    ? `Each student has finished Exercise ${exercise.number} in ${section.title}.`
    : `Each student has completed the task for ${section.title}.`;
}

function participationFor(exercise: SectionExercise | null): string {
  if (!exercise) return 'Each student writes or says their own answer. Check every student, not only a spokesperson.';
  if (exercise.grouping === 'groups') {
    return `Groups of ${exercise.groupSize ?? 3}. Each student has one job and speaks or writes before the group shares.`;
  }
  if (exercise.grouping === 'pairs') {
    return 'Pairs. Each student completes the item, then checks the partner\'s answer.';
  }
  return 'Each student writes in their own notebook. There is no group answer.';
}

function activityTitle(section: SectionPlan, exercise: SectionExercise | null): string {
  if (!exercise) return section.title;
  const sentence = exercise.instruction
    .replace(/^(?:Exercise\s+\d+|B\.\s*Exercise)\s*/i, '')
    .split(/(?<=[.!?])\s+/)[0]
    ?.trim() ?? '';
  const action = sentence.replace(/^\d+[.)]\s*/, '').trim();
  if (action.length >= 12) return clip(action, 80).replace(/[.!?]$/, '');
  return `${section.title} exercise ${exercise.number}`;
}

type Timed = { label: string; minutes: number };

function normalizeBlocks(periodMinutes: number): Timed[] {
  const total = Math.max(20, Math.min(80, Math.round(periodMinutes) || 40));
  const weights = [5, 8, 7, 15, 5];
  const raw = weights.map((weight) => Math.max(3, Math.round((total * weight) / 40)));
  raw[4] = total - raw.slice(0, 4).reduce((sum, value) => sum + value, 0);
  if (raw[4]! < 3) {
    const need = 3 - raw[4]!;
    raw[3] = Math.max(3, raw[3]! - need);
    raw[4] = total - raw.slice(0, 4).reduce((sum, value) => sum + value, 0);
  }
  const labels = [
    'Introduction',
    'Teacher explanation',
    'Guided practice',
    'Student practice',
    'Assessment',
  ];
  return labels.map((label, index) => ({ label, minutes: raw[index]! }));
}

function mergeHeadingSections(
  lessonSections: Array<{ heading: string; number: string; body: string }>,
  exerciseSections: Array<{ heading: string; number: string; body: string }>,
): Array<{ heading: string; number: string; body: string }> {
  const ordered: Array<{ heading: string; number: string; body: string }> = [];
  const seen = new Set<string>();
  for (const section of [...lessonSections, ...exerciseSections]) {
    if (seen.has(section.heading)) continue;
    seen.add(section.heading);
    const fromLesson = lessonSections.find((item) => item.heading === section.heading);
    const fromExercise = exerciseSections.find((item) => item.heading === section.heading);
    const lessonText = fromLesson?.body ?? '';
    const exerciseText = fromExercise?.body ?? '';
    ordered.push({
      heading: section.heading,
      number: (fromLesson ?? fromExercise)!.number,
      body: lessonText.trim().length >= 80 ? lessonText : exerciseText || lessonText,
    });
  }
  return ordered;
}

const ACTIVITY_CONTEXT_LIMIT = 48_000;

/** The activity model sees the whole unit, including later sections, not only the opening pages. */
export function activityChapterContext(chapterText: string): string {
  const { lessonBody, exercises } = splitCompiledChapter(chapterText);
  const full = exercises ? `${lessonBody}\n\n## Exercises\n\n${exercises}` : lessonBody;
  if (full.length <= ACTIVITY_CONTEXT_LIMIT) return full;

  const lessonSections = splitByHeading(lessonBody);
  const exerciseSections = splitByHeading(exercises);
  const sections =
    lessonSections.length >= 2 ? lessonSections : mergeHeadingSections(lessonSections, exerciseSections);
  const outcome = (lessonBody.split(HEADING)[0] ?? lessonBody).trim().slice(0, 3500);
  const chunks = [outcome];
  const source = sections.length >= 2 ? sections : [{ heading: 'CHAPTER', number: '', body: lessonBody }];
  for (const section of source) {
    const exercise = exerciseSections.find((item) => item.heading === section.heading)?.body ?? '';
    const story = section.body.replace(/\s+/g, ' ').trim().slice(0, 3500);
    const tasks = exercise
      .split(/\n(?=Exercise\s+\d+\b|Note for teachers:)/i)
      .slice(0, 8)
      .map((part) => part.trim().slice(0, 700))
      .filter(Boolean)
      .join('\n');
    chunks.push(`${section.heading} ${section.number}\n${story}\n${tasks}`.trim());
  }
  return chunks.join('\n\n').slice(0, ACTIVITY_CONTEXT_LIMIT);
}

function splitByHeading(text: string): Array<{ heading: string; number: string; body: string }> {
  const matches = [...text.matchAll(HEADING)];
  if (!matches.length) return [];
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    return {
      heading: match[1]!.toUpperCase(),
      number: match[2]!,
      body: text.slice(start, end).trim(),
    };
  });
}

function learningOutcomes(lesson: string): Partial<Record<SectionSkill, string>> {
  const block = lesson.split(/READING COMPREHENSION\s+\d+\.\d+/i)[0] ?? lesson;
  const learn = block.split(/what will i learn\?/i)[1] ?? '';
  const chunks = learn.split(/\n(?=[A-Z][A-Za-z ]{3,40}\n)/);
  const out: Partial<Record<SectionSkill, string>> = {};
  for (const chunk of chunks) {
    const [first, ...rest] = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!first) continue;
    const skill = skillOf(first);
    if (skill === 'OTHER') continue;
    const bullets = rest
      .map((line) => line.replace(/^[•\-\d.)\s]+/, '').trim())
      .filter((line) => line.length > 8);
    if (bullets.length) out[skill] = objectiveFromBullet(bullets[0]!);
  }
  return out;
}

function parseExercises(chunk: string, sliceKey: string): SectionExercise[] {
  if (!chunk.trim()) return [];
  const parts = chunk.split(/\n(?=(?:Exercise\s+\d+|B\.\s*Exercise)\b)/i);
  const headed = parts.map((part) => part.trim()).filter((part) => /^(?:Exercise\s+\d+|B\.\s*Exercise)\b/i.test(part));
  const source = headed.length ? headed : [chunk.trim()].filter((part) => part.length >= 20);
  const exercises: SectionExercise[] = [];
  source.forEach((trimmed, index) => {
    if (trimmed.length < 20) return;
    const header = trimmed.match(/^(?:Exercise\s+(\d+)|B\.\s*Exercise)/i);
    const number = header?.[1] ?? (header ? 'B' : String(index + 1));
    const noteMatch = trimmed.match(/Note for teachers:\s*([\s\S]+)$/i);
    const teacherNote = noteMatch ? clip(noteMatch[1]!.trim(), 400) : null;
    const body = noteMatch ? trimmed.slice(0, noteMatch.index).trim() : trimmed;
    const instruction = clip(body.split('\n').slice(0, 4).join(' '), 500);
    const items = body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^(?:\d+[.)]|[a-h][.)]|\([a-h]\))/.test(line))
      .slice(0, 8)
      .map((line) => clip(line, 180));
    const grouping = groupingOf(`${body} ${teacherNote ?? ''}`);
    exercises.push({
      key: `${sliceKey}-ex${number}`,
      number,
      instruction,
      teacherNote,
      items,
      grouping: grouping.grouping,
      groupSize: grouping.groupSize,
    });
  });
  return exercises.slice(0, 12);
}

function groupingOf(text: string): { grouping: ExerciseGrouping; groupSize: number | null } {
  const words: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6 };
  const sized = text.match(/groups?\s+of\s+(\d+|two|three|four|five|six)/i);
  if (sized) {
    const raw = sized[1]!.toLowerCase();
    return { grouping: 'groups', groupSize: words[raw] ?? Number(raw) };
  }
  if (/\bin groups\b/i.test(text)) return { grouping: 'groups', groupSize: 3 };
  if (/\bpairs?\b|\bpartner\b/i.test(text)) return { grouping: 'pairs', groupSize: 2 };
  return { grouping: 'individual', groupSize: null };
}

function contentPoints(body: string): string[] {
  const chunks = body
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 20 && line.length <= 240);
  const source = chunks.length
    ? chunks
    : body
        .replace(/\s+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length >= 40 && sentence.length <= 240);
  if (!source.length) return [];
  const picks = [source[0]!];
  for (const index of [Math.floor(source.length * 0.45), Math.floor(source.length * 0.75)]) {
    const chunk = source[index];
    if (chunk && !picks.includes(chunk)) picks.push(chunk);
  }
  return picks.slice(0, 3).map((chunk) => clip(chunk, 200));
}

function anchorFrom(body: string, heading: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  const slice = flat.slice(0, 160).trim();
  if (slice.length >= 8) return slice;
  return `${heading} from the textbook.`;
}

function skillOf(heading: string): SectionSkill {
  const value = heading.toLowerCase();
  if (value.includes('reading')) return 'READING';
  if (value.includes('oral')) return 'ORAL';
  if (value.includes('language')) return 'LANGUAGE';
  if (value.includes('writing')) return 'WRITING';
  if (value.includes('study')) return 'STUDY';
  if (value.includes('fun')) return 'FUN';
  return 'OTHER';
}

function titleCase(heading: string): string {
  return heading
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function objectiveFromBullet(bullet: string): string {
  let text = bullet.replace(/\.$/, '').trim();
  text = text.replace(/^Collecting\b/i, 'collect');
  text = text.replace(/^Completing\b/i, 'complete');
  text = `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  return `Students can ${text}.`;
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const window = clean.slice(0, max);
  const sentenceAt = window.search(/[.!?](?=\s|$)/);
  if (sentenceAt >= 40) return window.slice(0, sentenceAt + 1).trim();
  const words = window.replace(/\s+\S*$/, '').trim();
  const cut = words.length >= 20 ? words : window.trim();
  return /[.!?]$/.test(cut) ? cut : `${cut}.`;
}

export type SectionTeachingPackDraft = {
  complexity: 'LOW' | 'MEDIUM' | 'HIGH';
  summary: string;
  teacherGuide: string[];
  readingSlices: Array<{
    sliceKey: string;
    title: string;
    readingFrom: string;
    readingTo: null;
    explainPoints: string[];
  }>;
  questions: Array<{
    sliceKey: string;
    question: string;
    expectedAnswer: string;
    format: 'ORAL' | 'WRITTEN' | 'QUICK_FIRE';
  }>;
  activities: Array<{
    sliceKey: string;
    title: string;
    learningObjective: string;
    description: string;
    materials: string;
    steps: string[];
    participationTechnique: string;
    expectedOutcome: string;
    durationMinutes: number;
  }>;
  revisionPoints: Array<{ sliceKey: string; point: string }>;
};

/** A pack built from the textbook sections, so exercises are not dropped when the chapter is long. */
export function teachingPackFromSectionPlans(plans: SectionPlan[], chapterTitle: string): SectionTeachingPackDraft {
  const usable = plans.slice(0, 12);
  const questions = usable.flatMap((section) =>
    (section.exercises.length ? section.exercises : []).map((exercise) => ({
      sliceKey: section.sliceKey,
      question: clip(`Exercise ${exercise.number}: ${exercise.instruction}`, 600),
      expectedAnswer: clip(
        exercise.teacherNote || exercise.items[0] || `Check Exercise ${exercise.number} against the textbook.`,
        1200,
      ),
      format: (section.skill === 'ORAL' || section.skill === 'FUN' ? 'ORAL' : 'WRITTEN') as 'ORAL' | 'WRITTEN',
    })),
  );
  if (!questions.length) {
    questions.push({
      sliceKey: usable[0]!.sliceKey,
      question: clip(usable[0]!.learningObjective, 600),
      expectedAnswer: 'Accept an answer the textbook supports.',
      format: 'WRITTEN',
    });
  }
  return {
    complexity: 'MEDIUM',
    summary: clip(
      `${chapterTitle} is taught by section: ${usable.map((section) => section.title).join(', ')}.`,
      4000,
    ),
    teacherGuide: usable.map((section) => clip(`${section.title}: ${section.learningObjective}`, 500)).slice(0, 40),
    readingSlices: usable.map((section) => ({
      sliceKey: section.sliceKey,
      title: clip(section.title, 160),
      readingFrom: clip(section.anchor, 800),
      readingTo: null,
      explainPoints: (section.contentPoints.length ? section.contentPoints : [section.learningObjective])
        .slice(0, 12)
        .map((point) => clip(point, 400)),
    })),
    questions: questions.slice(0, 40),
    activities: packActivities(usable),
    revisionPoints: usable.map((section) => ({
      sliceKey: section.sliceKey,
      point: clip(section.learningObjective, 400),
    })),
  };
}

export function boundedTeachingBrief(lesson: string, exercises: string): string {
  const lessonSections = splitByHeading(lesson);
  const lessonBrief = (lessonSections.length ? lessonSections : [{ heading: 'LESSON', number: '', body: lesson }])
    .map((section) => `${section.heading} ${section.number}\n${section.body.replace(/\s+/g, ' ').trim().slice(0, 900)}`)
    .join('\n\n');
  const exerciseLines = exercises.split('\n');
  const kept: string[] = [];
  for (let index = 0; index < exerciseLines.length; index++) {
    const line = exerciseLines[index] ?? '';
    if (/^(Exercise\s+\d+|B\.\s*Exercise|Note for teachers:|Unit\s+)/i.test(line.trim())) {
      kept.push(...exerciseLines.slice(index, index + 8));
      index += 7;
    }
  }
  const exerciseBrief = kept.join('\n').slice(0, 7000);
  return `--- LESSON SECTIONS ---\n${lessonBrief.slice(0, 8000)}\n--- EXERCISE INSTRUCTIONS ---\n${exerciseBrief}\n--- END ---`.slice(
    0,
    16_000,
  );
}

function packActivities(plans: SectionPlan[]): SectionTeachingPackDraft['activities'] {
  const chosen = plans.slice(0, 5);
  return chosen.map((section) => {
    const exercise =
      section.exercises.find((item) => item.number === '2') ?? section.exercises[0] ?? null;
    const students = exercise
      ? studentPractice(section, exercise)
      : `Complete the task printed in ${section.title}.`;
    const teacher = exercise ? teacherLeads(section, exercise) : `Set up ${section.title} from the textbook.`;
    return {
      sliceKey: section.sliceKey,
      title: clip(activityTitle(section, exercise), 160),
      learningObjective: clip(section.learningObjective, 400),
      description: clip(students, 1200),
      materials: 'Textbook and notebooks',
      steps: [
        clip(teacher, 400),
        clip(`Move around while students work. ${participationFor(exercise)}`, 400),
        clip(assessmentFor(section, exercise), 400),
      ],
      participationTechnique: clip(participationFor(exercise), 800),
      expectedOutcome: clip(outcomeFor(section, exercise), 400),
      durationMinutes: 40,
    };
  });
}

function isSectionPlan(value: unknown): value is SectionPlan {
  if (!value || typeof value !== 'object') return false;
  const plan = value as Partial<SectionPlan>;
  return typeof plan.sliceKey === 'string' && typeof plan.title === 'string' && typeof plan.skill === 'string';
}
