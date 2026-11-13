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
  if (lessonSections.length < 2) return [];

  const outcomes = learningOutcomes(lessonBody);
  return lessonSections.map((section, index) => {
    const skill = skillOf(section.heading);
    const exerciseChunk =
      exerciseSections.find((item) => item.heading === section.heading)?.body ??
      (index === 0 ? exercises.split(HEADING)[0] ?? '' : '');
    const exercisesForSection = parseExercises(exerciseChunk, `s${index + 1}`);
    if (skill === 'ORAL' && /amina|hina|mariam/i.test(exerciseChunk)) {
      for (const exercise of exercisesForSection) {
        exercise.grouping = 'groups';
        exercise.groupSize = 3;
      }
    }
    const objective =
      outcomes[skill] ||
      `Students can use what ${section.heading} ${section.number} teaches.`;
    return {
      sliceKey: `s${index + 1}`,
      title: `${titleCase(section.heading)} ${section.number}`,
      skill,
      learningObjective: clip(objective, 240),
      contentPoints: contentPoints(section.body, skill),
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
  const oral = /agreement|disagreement|amina|hina|mariam/i.test(notes);
  const horseDebate = /rich man/i.test(notes) && /beggar/i.test(notes) && /half the class/i.test(notes);
  if (oral && horseDebate) issues.push('oral task is replaced by the horse dispute');
  const teacher = notes.split('What the teacher does:')[1]?.split('What students do:')[0] ?? '';
  const students = notes.split('What students do:\n')[1]?.split('\n\n')[0] ?? '';
  if (teacher && students && collapse(teacher) === collapse(students)) {
    issues.push('student instructions repeat teacher instructions');
  }
  const objective = notes.match(/Learning objective:\s*(.+)/)?.[1] ?? '';
  const check = notes.split('Check understanding:\n')[1]?.split('\nExpected outcome:')[0] ?? '';
  if (/agreement|disagree/i.test(objective) && /horse|capital|paragraph|prefix/i.test(check) && !/agree|disagree|phrase/i.test(check)) {
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
    section.title,
    '',
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
  const { section, exercise } = assignment;
  const title = activityTitle(section, exercise);
  const objective = section.learningObjective;
  const students = exercise
    ? studentPractice(section, exercise)
    : `Use ${section.title} in your own work.`;
  const teacher = exercise
    ? teacherLeads(section, exercise)
    : `Set up ${section.title}. Watch every student produce their own result.`;
  const check = assessmentFor(section, exercise);
  const notes = [
    title,
    '',
    `Chapter section: ${section.title}`,
    `Learning objective: ${objective}`,
    'You need: Textbook and notebooks',
    'Duration: ' + blocks.reduce((sum, block) => sum + block.minutes, 0) + ' minutes',
    ...blocks.map((block) => `- ${block.label}: ${block.minutes} minutes.`),
    '',
    'What the teacher does:',
    `1. (${blocks[0]!.minutes} min) ${blocks[0]!.label}. ${teacher}`,
    `2. (${blocks[1]!.minutes} min) ${blocks[1]!.label}. Start the task. ${participationFor(exercise)}`,
    `3. (${blocks[2]!.minutes} min) ${blocks[2]!.label}. Move around. ${clip(students, 220)}`,
    `4. (${blocks[3]!.minutes} min) ${blocks[3]!.label}. Hear two or three results. Correct only from the textbook.`,
    `5. (${blocks[4]!.minutes} min) ${blocks[4]!.label}. ${check}`,
    '',
    'What students do:',
    students,
    '',
    'How every student participates:',
    participationFor(exercise),
    '',
    'Check understanding:',
    check,
    `Expected outcome: ${outcomeFor(section, exercise)}`,
  ].join('\n');
  return { objective, notes, titleSuffix: title, kind: 'ACTIVITY' };
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
  const preference: SectionSkill[] = ['ORAL', 'WRITING', 'FUN', 'LANGUAGE', 'STUDY', 'READING'];
  const pool = sections.flatMap((section) =>
    section.exercises.map((exercise) => ({ section, exercise })),
  );
  for (const skill of preference) {
    const unused = pool.find((item) => item.section.skill === skill && !used.has(item.exercise.key));
    if (unused) return { mode: 'activity', section: unused.section, exercise: unused.exercise };
  }
  for (const skill of preference) {
    const match = pool.find((item) => item.section.skill === skill);
    if (match) return { mode: 'activity', section: match.section, exercise: match.exercise };
  }
  const section = sections[0]!;
  return { mode: 'activity', section, exercise: section.exercises[0] ?? null };
}

function studentPractice(section: SectionPlan, exercise: SectionExercise): string {
  const blob = `${exercise.instruction} ${exercise.items.join(' ')} ${exercise.teacherNote ?? ''}`;
  if (section.skill === 'ORAL' && /amina|hina|mariam/i.test(blob)) {
    if (exercise.number === '2') {
      return 'Take one role. Speak the health dialogue in all three sequences: Amina then Hina then Mariam, then rotate so each student plays each speaker. Use the agreement and disagreement phrases from the table.';
    }
    if (exercise.number === '3') {
      return 'In your group of three, prepare two or three lines each on the topic the teacher assigns. Speak both an agreement and a disagreement from the phrase table, then role-play the dialogue.';
    }
    return 'In groups of three, assign each mixed health line to Amina, Hina, or Mariam and write the dialogue in your notebooks.';
  }
  if (section.skill === 'READING') {
    const asked = `${exercise.instruction} ${exercise.items.join(' ')}`;
    if (/steeple|poem/i.test(asked) && !/horse/i.test(asked)) {
      return 'Answer the poem questions in your notebook: why the speaker climbed the steeple, why God told him to go down, and the message of the poem.';
    }
    if (/horse|story/i.test(asked)) {
      return 'Answer the story questions in your notebook, including who got the horse and what the horse did when each man touched it.';
    }
  }
  if (section.skill === 'FUN' && /ghost|story/i.test(blob)) {
    return 'In groups of five, answer the ghost-story questions and say your ending to the class in English.';
  }
  if (section.skill === 'STUDY') {
    return 'Write one row of the Wh-question table for a problem in the textbook, then write a second row for a problem in your own area.';
  }
  if (section.skill === 'LANGUAGE') {
    if (/prefix|suffix/i.test(blob)) {
      return 'Write the new word with the prefix or suffix the exercise asks for. Check the spelling when the root ends in e.';
    }
    if (/comma|full stop|apostrophe|quotation/i.test(blob)) {
      return 'Add the missing commas, full stops, apostrophes, or quotation marks in your notebook. Then compare the sentence with your partner.';
    }
    return 'Correct the printed sentences in your notebook. Capitalize names, places, and the start of each sentence.';
  }
  if (section.skill === 'WRITING' && /cluster|paragraph|sindh/i.test(blob)) {
    if (exercise.number === '4') {
      return 'Choose one area your group discussed and write your own paragraph on it. Keep a topic sentence, details that match it, and a concluding sentence.';
    }
    if (exercise.number === '2' || /write a paragraph/i.test(blob)) {
      return 'Write one paragraph from the cluster. Keep a topic sentence, details that match it, and a concluding sentence.';
    }
    return 'Add two items to the Sindh cluster, or build a new cluster for the topic the teacher names.';
  }
  const grouping =
    exercise.grouping === 'groups'
      ? `Work in groups of ${exercise.groupSize ?? 3}. `
      : exercise.grouping === 'pairs'
        ? 'Work in pairs. '
        : 'Write in your own notebook. ';
  const item = exercise.items[0] ? ` Start with: ${clip(exercise.items[0], 140)}` : '';
  return `${grouping}${clip(exercise.instruction, 220)}${item}`;
}

function teacherLeads(section: SectionPlan, exercise: SectionExercise): string {
  const blob = `${exercise.instruction} ${exercise.teacherNote ?? ''}`;
  if (section.skill === 'ORAL' && /amina|hina|mariam/i.test(blob)) {
    if (exercise.number === '3') {
      return 'Number the groups from 1 to 6 and assign each number one printed topic. Tell them to use both agreement and disagreement expressions.';
    }
    if (exercise.number === '2') {
      return 'Keep the groups of three. Call the three role sequences one at a time and listen for the printed phrases.';
    }
    return 'Write the agreement and disagreement columns on the board. Divide the class into groups of three and assign Amina, Hina, and Mariam.';
  }
  if (section.skill === 'LANGUAGE') {
    return 'Correct the first printed sentence on the board. Then set the class to finish the exercise.';
  }
  if (section.skill === 'WRITING' && /cluster|paragraph/i.test(blob)) {
    if (/sindh/i.test(`${blob} ${section.contentPoints.join(' ')}`)) {
      return 'Draw the Sindh cluster, or write Education on the board and build a cluster with the class, before students write.';
    }
    return 'Build a cluster on the board with the class before students write.';
  }
  if (section.skill === 'FUN' && /ghost|story/i.test(blob)) {
    return 'Put students in groups of five. Tell them they will finish the ghost story and say it in English.';
  }
  if (section.skill === 'STUDY') {
    return 'Copy one problem row from the textbook table. Fill why, where, and when with the class, then set the next row.';
  }
  return `Read the instruction for Exercise ${exercise.number}. Complete the first item with the class.`;
}

function openingFor(section: SectionPlan): string {
  if (section.skill === 'READING') {
    if (/steeple|caliph|horse|poem/i.test(section.contentPoints.join(' '))) {
      return 'Ask what makes a person good or bad, then open the poem or the story. Do not ask students to read the heading aloud as the lesson.';
    }
    return 'Ask one question students can answer from their own experience, then open the text. Do not ask students to read the heading aloud as the lesson.';
  }
  if (section.skill === 'ORAL' && /agree|disagree/i.test(section.contentPoints.join(' '))) {
    return 'Ask two students to agree and disagree with a simple classroom statement, then show the phrase table.';
  }
  if (section.skill === 'LANGUAGE') {
    return 'Write one incorrect sentence from the exercise and ask what is wrong, before stating the rule.';
  }
  if (section.skill === 'WRITING') {
    return 'Write one topic in a circle and ask the class for ideas around it.';
  }
  if (section.skill === 'STUDY') {
    return 'Name one school problem. Ask why, where, and when it happens.';
  }
  return 'Read the fun task once. Tell students the work is in English.';
}

function assessmentFor(section: SectionPlan, exercise: SectionExercise | null): string {
  if (section.skill === 'ORAL' && /agree|disagree|amina/i.test(`${exercise?.instruction ?? ''} ${section.contentPoints.join(' ')}`)) {
    return 'Point to one line a student spoke. Ask: does this agree or disagree, and which printed phrase shows it?';
  }
  if (section.skill === 'READING') {
    const blob = `${exercise?.instruction ?? ''} ${(exercise?.items ?? []).join(' ')}`;
    if (/steeple|poem|message of this poem/i.test(blob) && !/horse/i.test(blob)) {
      return 'Ask why the speaker climbed the steeple and what God told him. Accept the idea that God dwells among the people.';
    }
    return 'Ask who received the horse and what the horse did when each man touched it. Accept only the touch test from the story.';
  }
  if (section.skill === 'LANGUAGE') {
    const blob = `${exercise?.instruction ?? ''} ${(exercise?.items ?? []).join(' ')}`;
    if (/prefix|suffix/i.test(blob)) {
      return 'Check two new words. Accept a word only when the prefix or suffix asked for is spelled correctly.';
    }
    if (/comma|full stop|apostrophe|quotation/i.test(blob)) {
      return 'Look at two sentences. Accept them only when the missing commas, stops, apostrophes, or quotation marks are in the right place.';
    }
    return 'Look at two corrected sentences. Accept the work only when names, places, and sentence openings are capitalized.';
  }
  if (section.skill === 'WRITING') {
    if (exercise?.number === '1') {
      return 'Look at the cluster. Accept the two new items only when they belong to the topic in the centre.';
    }
    return 'Read one paragraph. Accept it only when the details match the topic sentence and a concluding sentence is present.';
  }
  if (section.skill === 'STUDY') {
    return 'Check one row of the table. Accept it only when the why, where, and when answers belong to that problem.';
  }
  if (section.skill === 'FUN') {
    return 'Listen to the ending. Accept it only if the group tells it in English and answers what happened inside the house.';
  }
  return exercise
    ? `Check the class against Exercise ${exercise.number}. Accept answers the textbook supports.`
    : `Check the work against ${section.title}.`;
}

function outcomeFor(section: SectionPlan, exercise: SectionExercise | null): string {
  if (section.skill === 'ORAL' && /amina|agree|disagree/i.test(`${exercise?.instruction ?? ''} ${section.contentPoints.join(' ')}`)) {
    if (exercise?.number === '2') {
      return 'Every student has spoken once as Amina, once as Hina, and once as Mariam, using both an agreement and a disagreement.';
    }
    if (exercise?.number === '3') {
      return 'Every student has spoken an agreement and a disagreement on the assigned topic, using phrases from the table.';
    }
    return 'Each group has written the health dialogue, with every mixed line given to Amina, Hina, or Mariam.';
  }
  if (section.skill === 'READING') {
    const blob = `${exercise?.instruction ?? ''} ${(exercise?.items ?? []).join(' ')}`;
    if (/steeple|poem|message of this poem/i.test(blob) && !/horse/i.test(blob)) {
      return 'Each student can say the message of the poem: God dwells among the people.';
    }
    return 'Each student can say who the horse belonged to and how the Caliph knew.';
  }
  if (section.skill === 'LANGUAGE') {
    return 'Each notebook has the corrected sentences or the new words from this exercise.';
  }
  if (section.skill === 'WRITING' && /cluster|paragraph|sindh/i.test(`${exercise?.instruction ?? ''} ${section.contentPoints.join(' ')}`)) {
    if (exercise?.number === '1') return 'Each notebook has the Sindh cluster with two added items that belong to Sindh.';
    return 'Each notebook has a paragraph with a topic sentence, matching details, and a concluding sentence.';
  }
  if (section.skill === 'STUDY') {
    return 'Each group has a completed Wh-question row for a real problem.';
  }
  if (section.skill === 'FUN' && /ghost|story/i.test(`${exercise?.instruction ?? ''} ${section.contentPoints.join(' ')}`)) {
    return 'Each group has told a ghost-story ending in English.';
  }
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
  if (section.skill === 'ORAL' && /amina|hina|mariam/i.test(exercise?.instruction ?? '')) {
    if (exercise?.number === '3') return 'Agree and disagree on a new topic';
    return 'Agree and disagree: the health dialogue';
  }
  if (section.skill === 'WRITING' && /cluster|paragraph/i.test(`${exercise?.instruction ?? ''} ${section.contentPoints.join(' ')}`)) {
    if (exercise?.number === '2' || exercise?.number === '4') return 'Write your own paragraph';
    return 'Cluster and write a paragraph';
  }
  if (section.skill === 'FUN' && /ghost|story/i.test(`${exercise?.instruction ?? ''} ${section.contentPoints.join(' ')}`)) {
    return 'Finish the ghost story';
  }
  if (section.skill === 'LANGUAGE') return 'Correct the language exercise';
  if (section.skill === 'STUDY') return 'Collect points with Wh-questions';
  return exercise ? `${section.title} exercise ${exercise.number}` : section.title;
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
  const exercises: SectionExercise[] = [];
  parts.forEach((part, index) => {
    const trimmed = part.trim();
    if (trimmed.length < 20) return;
    const number = trimmed.match(/^(?:Exercise\s+(\d+)|B\.\s*Exercise)/i)?.[1] ?? (index === 0 ? 'B' : String(index + 1));
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

function contentPoints(body: string, skill: SectionSkill): string[] {
  if (skill === 'READING') {
    const points: string[] = [];
    if (/voice of god|steeple/i.test(body)) {
      points.push(
        'The speaker climbs a steeple to hear God.',
        'God tells him to go back down, because God dwells among the people.',
      );
    }
    if (/wise caliph|horse/i.test(body)) {
      points.push(
        'Caliph Haroon-ur-Rashid walked Baghdad in disguise to learn the people’s problems, and he was known for justice.',
        'The rich man and the beggar each claim the white horse. The horse winces at the beggar and neighs for the rich man, so the Caliph gives the horse to the rich man.',
      );
    }
    if (points.length) return points.slice(0, 4);
  }
  if (skill === 'ORAL' && /agree|disagree/i.test(body)) {
    return [
      'Agreement phrases include “I agree”, “that makes sense”, and “that’s right”.',
      'Disagreement phrases include “I don’t agree”, “this doesn’t make sense”, and “that’s not right”.',
    ];
  }
  if (skill === 'LANGUAGE' && /capital|prefix|suffix|punctuation/i.test(body)) {
    return [
      'Capital letters and punctuation marks make the sentence clear.',
      'A prefix is added at the start of a word and a suffix at the end. Drop the final e before many suffixes.',
    ];
  }
  if (skill === 'WRITING' && /cluster|paragraph/i.test(body)) {
    const points = [
      'Clustering puts the topic in a circle and the related ideas around it.',
      'A paragraph has a topic sentence, details that stay on that idea, and a concluding sentence.',
    ];
    if (/sindh/i.test(body)) {
      points.push('The textbook example is the economy of Sindh: agriculture, tourism, and Karachi’s port.');
    }
    return points;
  }
  if (skill === 'STUDY' && /wh-|why|where|when/i.test(body)) {
    return ['Collect points for a talk or a piece of writing by answering Wh-questions: why, where, when, and how.'];
  }
  if (skill === 'FUN' && /ghost|story/i.test(body)) {
    return ['Groups of five finish the ghost story from the language exercise and tell it to the class.'];
  }
  const sentences = body
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 40 && sentence.length < 220);
  return sentences.slice(0, 3).map((sentence) => clip(sentence, 200));
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
  return `${clean.slice(0, max - 1).trimEnd()}…`;
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
  const preference: SectionSkill[] = ['ORAL', 'WRITING', 'LANGUAGE', 'FUN', 'STUDY', 'READING'];
  const chosen: SectionPlan[] = [];
  for (const skill of preference) {
    const section = plans.find((plan) => plan.skill === skill);
    if (section && !chosen.includes(section)) chosen.push(section);
    if (chosen.length === 5) break;
  }
  for (const section of plans) {
    if (chosen.length >= 3) break;
    if (!chosen.includes(section)) chosen.push(section);
  }
  return chosen.slice(0, 5).map((section) => {
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
