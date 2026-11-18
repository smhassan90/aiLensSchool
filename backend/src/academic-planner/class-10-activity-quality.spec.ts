import {
  CHAPTER_ACTIVITY_SYSTEM_PROMPT,
  CHAPTER_TEACHING_PACK_PROMPT_VERSION,
  CHAPTER_TEACHING_PACK_SYSTEM_PROMPT,
} from '../ai/prompts/index';
import {
  activityDayNotes,
  formatSavedActivityNotes,
  isPreparedClassroomActivity,
  selectSavedActivity,
  type SavedActivity,
} from './saved-activity-plan';
import { collectActivityCardIssues, collectClassroomFocusIssues } from '../library-books/activity-focus';
import { assertActivityQuality, collectActivityIssues, periodBreakdown } from '../library-books/activity-quality';

const participation = (line: string, correction: string) =>
  `Student might say: "${line}" You add: "${correction}"`;

function saved(
  title: string,
  sliceKey: string | null,
  description: string,
  spoken: string,
  correction: string,
): SavedActivity {
  return {
    sliceKey,
    title,
    description,
    participationTechnique: participation(spoken, correction),
    materials: 'Textbook and notebooks',
  };
}

const genericRecap = (chapter: string): SavedActivity =>
  saved(
    'Unit recap',
    null,
    `Teacher writes all section names of ${chapter} on the board. Each group owns one section and writes (a) its meaning in simple words, (b) one line from the textbook, (c) one real-life example.`,
    'Oral communication is just talking freely.',
    'Use the textbook line for that section.',
  );

const unit5: SavedActivity[] = [
  genericRecap('Unit 5'),
  saved(
    'Dream twist discussion',
    's1',
    'After silent reading, groups list three scary events in the story and one clue that the trip might still be a dream. Class votes on the best clue.',
    'They were already living in the village for ten days for real.',
    'Mrs. Karim says they are supposed to be leaving now for the trip, so the horror was only a bad dream.',
  ),
  saved(
    'Mini presentation with feedback',
    's2',
    'Pairs present for one minute on respecting others in class. Each listener gives one positive comment and one suggestion using the criterion on the board.',
    'Your presentation was bad.',
    'Evaluation should comment against the criterion, such as clear voice and respectful language.',
  ),
  saved(
    'Modal request and advice drill',
    's3',
    'Each student writes two formal requests and two pieces of advice with should. Partners swap and correct the modal verb.',
    'Will you explain that again, please? is formal.',
    'Would you explain that again, please? is the formal request in the text; will is informal.',
  ),
  saved(
    'Draft letter to the editor',
    's4',
    'Each student chooses a school or community issue and writes a short letter with the date, salutation, a brief concern, a clear opinion, and their name.',
    'I can write a long story about my friend.',
    'A letter to the editor addresses a public concern briefly and states an opinion.',
  ),
];

const unit7: SavedActivity[] = [
  genericRecap('Unit 7'),
  saved(
    'Gorakh Hills travel diary',
    's1',
    'Each student writes a first-person diary entry, with the day and date, about one place on the Gorakh Hills journey.',
    'A diary is just a list of cities.',
    'The study-skills page says a diary uses first person and records what the writer felt.',
  ),
  saved(
    'Consensus on a class trip',
    's2',
    'Groups of four choose one destination and each student speaks once, using a polite phrase such as "I have a different idea" or "I agree with you".',
    'We should just vote and ignore the other idea.',
    'The oral section says negotiate with a polite phrase until the group reaches agreement.',
  ),
  saved(
    'Type 3 conditional challenge',
    's3',
    'Each student writes two type 3 sentences about the journey: what would have happened if a past action had been different.',
    'If I studied, I will pass.',
    'Type 3 uses if + had + past participle, and would have + past participle, for an unreal past.',
  ),
  saved(
    'Persuasive essay on the journey',
    's4',
    'Each student writes four paragraphs that persuade a reader, using one logic appeal and one emotion appeal from the writing section.',
    'I will only tell a story about the hills.',
    'A persuasive essay needs a thesis, reasons, a counterargument, and a conclusion.',
  ),
];

const unit8: SavedActivity[] = [
  genericRecap('Unit 8'),
  saved(
    'Helmet-law scenarios',
    's1',
    'Each student takes one reason from the text for not wearing a helmet and writes the textbook reply about head injury, disability, or fines.',
    'A helmet is only for long trips.',
    'The text says wear the helmet from the moment the ride starts, because head injuries cause death and disability.',
  ),
  saved(
    'Helmet-law debate',
    's2',
    'Two sides debate a helmet law. Each speaker gives one reason, the leaders reply to the other side, and the class follows the debate rules in the unit.',
    'I can shout the other side down.',
    'The debate rules say use polite language, do not interrupt, and answer the other side in the rebuttal.',
  ),
  saved(
    'Relative pronoun and indirect speech challenge',
    's3',
    'Each student combines two sentences with who, whose, or which, then changes one request from the exercise into indirect speech.',
    'Who and which are the same for people and things.',
    'The text says who usually refers to people, and which or that refers to things.',
  ),
  saved(
    'Poem performance',
    's4',
    'Each student in a group of four reads and acts one verse of The Blind Men and the Elephant, then says what that man misunderstood.',
    'The men were all completely wrong, so the poem has no point.',
    'The poem says each man was partly right and all were wrong, because each felt only one part.',
  ),
];

const teacherMoves = [
  '(5 min) Read the task once.',
  '(10 min) Put students in groups and give each student a job.',
  '(15 min) Walk around and ask a quiet student to speak.',
  '(10 min) Hear each group decision and compare it with the example.',
];

function runnable(title: string, description: string, participation = 'Each student writes one sentence, then says it.'): SavedActivity {
  return {
    sliceKey: 's1',
    title,
    description,
    participationTechnique: participation,
    materials: 'None',
    learningObjective: 'Students can apply the chapter idea to a new decision.',
    teacherSteps: teacherMoves,
    expectedOutcome: 'Each group leaves with one written decision.',
    durationMinutes: 40,
  };
}

function withSteps(activity: SavedActivity) {
  const steps = Array.isArray(activity.teacherSteps) ? activity.teacherSteps.filter((step) => typeof step === 'string') : [];
  return { ...activity, steps };
}

function chosen(activities: SavedActivity[]): SavedActivity {
  const selected = selectSavedActivity({
    activities,
    coveredSliceKeys: ['s1', 's2', 's3', 's4'],
    usedTitles: [],
    preferRecap: true,
  });
  if (!selected) throw new Error('no activity selected');
  return selected;
}

describe('Class 10 English activity quality', () => {
  const chapters = [
    { name: 'Unit 5', activities: unit5 },
    { name: 'Unit 7', activities: unit7 },
    { name: 'Unit 8', activities: unit8 },
  ];

  it('selects a different chapter task instead of the same unit recap', () => {
    const titles = chapters.map((chapter) => chosen(chapter.activities).title);
    expect(titles).toEqual([
      'Dream twist discussion',
      'Gorakh Hills travel diary',
      'Helmet-law scenarios',
    ]);
    expect(new Set(titles).size).toBe(3);
  });

  it('keeps the objective, teacher steps, and student task distinct for a 40-minute lesson', () => {
    for (const chapter of chapters) {
      const activity = chosen(chapter.activities);
      const notes = formatSavedActivityNotes(activity, chapter.name, chapter.activities, 40);
      const objective = notes.match(/Learning objective: (.+)/)?.[1] ?? '';
      const student = notes.split('What students do:\n')[1]?.split('\n\n')[0] ?? '';
      expect(objective.toLowerCase()).not.toBe(student.toLowerCase());
      expect(notes.split(student).length - 1).toBe(1);
      expect(notes).toContain('What the teacher does:');
      expect(notes).toContain('How every student participates:');
      expect(notes).not.toContain('Every student produces an individual result');
      expect(notes).not.toContain('Introduction and instructions');
      expect(notes).toContain('Duration: 40 minutes');
      expect(notes).not.toMatch(/class period set aside/i);
      expect(notes).not.toMatch(/What did this activity ask you to do/i);
      expect(notes).not.toMatch(/Each group owns one section/);
    }
  });

  it('rejects a generic recap and a copied objective, and accepts a distinct activity', () => {
    expect(collectActivityIssues([genericRecap('Unit 5')]).join(' ')).toMatch(/generic section-summary/);
    const copied: SavedActivity = {
      ...unit5[4],
      learningObjective: unit5[4].description,
      teacherSteps: [unit5[4].description, unit5[4].description],
      expectedOutcome: 'Each student has a letter with a date, salutation, concern, opinion, and name.',
      durationMinutes: 40,
    };
    expect(collectActivityIssues([copied]).join(' ')).toMatch(/repeats/);
    const distinct: SavedActivity = {
      ...unit5[4],
      learningObjective: 'Students can write a short letter to the editor in the form the unit teaches.',
      teacherSteps: [
        'Show the date, salutation, concern, opinion, and name on the board.',
        'Ask each student to choose one real school or community issue.',
        'Walk the room and point to the textbook form when a letter misses a part.',
        'Hear two letters and mark the form, not the handwriting.',
      ],
      expectedOutcome: 'Each letter has a date, salutation, one public concern, an opinion, and a name.',
      durationMinutes: 40,
    };
    expect(collectActivityIssues([distinct])).toEqual([]);
    expect(() => assertActivityQuality([distinct])).not.toThrow();
  });

  it('keeps a prepared chapter activity instead of stamping a timing template on it', () => {
    const courtroom: SavedActivity = {
      sliceKey: 's1',
      title: 'Whose horse is it?',
      description:
        'Fictional scenario, inspired by this chapter. A shopkeeper and a traveller both claim a white horse outside a caravanserai. Facts: the horse follows the traveller, but it pulls away when the shopkeeper touches the rein. Group 1 defends the shopkeeper. Group 2 defends the traveller. Group 3 asks questions and gives a judgement. Example argument for the traveller: the horse shows who it trusts, which is the same kind of test the Caliph used. Example question for the judges: what did the horse do, and what does that show?',
      participationTechnique: 'Every student writes one argument before their group speaks, then one judge asks that student a question.',
      materials: 'None',
      learningObjective: 'Students can judge a claim by watching the evidence, as the Caliph did with the horse.',
      teacherSteps: [
        '(6 min) Tell the class this case is not in the textbook, then read the Caliph horse test in one minute.',
        '(8 min) Read the fictional case once and assign the three groups.',
        '(16 min) Move among the groups. Ask a silent student for their written argument.',
        '(10 min) The judges give a decision and say which chapter event it resembles.',
      ],
      expectedOutcome:
        'Each student has one written argument, and the judges name the horse test from the story.\n\nTeacher looks for: The argument uses what the horse did, and the judgement names the Caliph test.',
      durationMinutes: 40,
    };
    const notes = formatSavedActivityNotes(courtroom, 'Unit 1', [], 40);
    expect(isPreparedClassroomActivity(courtroom)).toBe(true);
    expect(notes).toMatch(/Fictional scenario/);
    expect(notes).toMatch(/white horse/);
    expect(notes).toMatch(/Example question/);
    expect(notes).toMatch(/Caliph/);
    expect(notes).not.toContain('Introduction and instructions');
    expect(notes).not.toContain('Main activity');
    expect(notes).not.toContain('Every student produces an individual result');
    expect(notes).not.toContain('You need:');
    expect(notes).not.toMatch(/- .+: \d+ minutes\./);
    expect(notes.match(/What the teacher does:/g)?.length).toBe(1);
    expect(notes.split('\n')[0]).toBe('Chapter: Unit 1');
    expect(notes.startsWith(courtroom.title)).toBe(false);
    expect(notes).toContain('Check understanding:');
    expect(notes).toContain('Expected outcome:');
    expect(notes.indexOf('Check understanding:')).toBeLessThan(notes.indexOf('Expected outcome:'));
    const outcome = 'Each student has one written argument, and the judges name the horse test from the story.';
    expect(notes.split(outcome).length - 1).toBe(1);
    const shorter = {
      ...courtroom,
      description: courtroom.description.replace(' outside a caravanserai', ''),
    };
    expect(shorter.description.length).toBeGreaterThanOrEqual(180);
    expect(shorter.description.length).toBeLessThan(courtroom.description.length);
    expect(isPreparedClassroomActivity(shorter)).toBe(true);
    const blocks = [...notes.matchAll(/\((\d+) min\)/g)].map((match) => Number(match[1]));
    expect(blocks).toEqual([6, 8, 16, 10]);
    const selected = selectSavedActivity({
      activities: [genericRecap('Unit 1'), courtroom, unit5[4]!],
      coveredSliceKeys: ['s1', 's4'],
      usedTitles: [],
      preferRecap: true,
    });
    expect(selected?.title).toBe('Whose horse is it?');
  });

  it('rejects a textbook replay and accepts a short fictional horse case', () => {
    const restage = runnable(
      'Act the horse court',
      'The class does a reconstruction of the court scene. The beggar speaks first, then the rich man. Replay the known verdict from the story. Stop when the horse chooses the rich man, which is the ending already printed in the textbook. Example answer: the horse goes to the rich man.',
    );
    expect(isPreparedClassroomActivity(restage)).toBe(false);
    expect(collectActivityCardIssues(withSteps(restage)).join(' ')).toMatch(/replay or reconstruct/);

    const fresh = runnable(
      'Who Does the Horse Trust?',
      'Fictional scenario, inspired by this chapter. A shopkeeper and a traveller both claim one bicycle. Groups of four. Roles: shopkeeper, traveller, witness, judge. The bicycle follows the traveller and pulls away from the shopkeeper. Who does the bicycle trust? What does that show? Example answer: the traveller keeps it, because the bicycle shows trust the way the horse did.',
    );
    expect(fresh.description.length).toBeLessThan(450);
    expect(isPreparedClassroomActivity(fresh)).toBe(true);
  });

  it('rejects a dignity-of-work replay and accepts a school decision', () => {
    const replay = runnable(
      'The lunch table again',
      'Replay the lunch table scene, stopping before Akhtar\'s final apology. Students act the same seats and the same words from the story. Example answer: Akhtar will say sorry, as the book already shows.',
    );
    expect(isPreparedClassroomActivity(replay)).toBe(false);
    expect(collectActivityCardIssues(withSteps(replay)).join(' ')).toMatch(/replay or reconstruct/);

    const school = runnable(
      'Who Sits Together?',
      'Fictional scenario, inspired by this chapter. A student at your school will not sit with the cleaner at lunch. Groups of four. Roles: speaker, listener, note-taker, judge. Should the class sit together? Which person from the unit would agree? Example answer: Sit together, because Uncle Inayat showed that every job deserves respect.',
    );
    expect(isPreparedClassroomActivity(school)).toBe(true);
  });

  it('accepts a freeze-and-advise task and rejects a leftover worksheet', () => {
    const advise = runnable(
      'Advise King Bruce',
      'Freeze the story before the spider\'s last try and advise King Bruce. Groups of three. Roles: king, adviser, scribe. What should Bruce do next? What does the spider show? Example answer: Try once more, because the spider kept going.',
      'Groups of three. Each student writes one piece of advice, then says it.',
    );
    expect(isPreparedClassroomActivity(advise)).toBe(true);

    const extra = runnable(
      'Advise King Bruce',
      'Freeze the story before the spider\'s last try and advise King Bruce. Groups of three. Roles: king, adviser, scribe. What should Bruce do next? Example answer: Try once more, because the spider kept going. Then complete a 1-9 attempt worksheet, write a motto, and collect slips to read tomorrow.',
      'Groups of three. Each student writes one piece of advice, then says it.',
    );
    expect(isPreparedClassroomActivity(extra)).toBe(false);
    expect(collectActivityCardIssues(withSteps(extra)).join(' ')).toMatch(/motto/);
  });

  it('rejects a hard-word title and a broken sentence, and accepts a finished choice', () => {
    const broken = runnable(
      'The Prudence Panel',
      'Zara should keep moderated when she posts a photo of a classmate. The group talks about her choice for the whole period and then stops. Example answer: Zara should keep moderated.',
    );
    expect(isPreparedClassroomActivity(broken)).toBe(false);
    expect(collectActivityCardIssues(withSteps(broken)).join(' ')).toMatch(/simple classroom words/);

    const choice = runnable(
      'Help Zara Decide',
      'Fictional scenario, inspired by this chapter. Zara wants to post a classmate\'s photo. Groups of three. Roles: Zara, friend, adviser. Should she keep it, limit it, or stop it? Who did not agree? Example answer: LIMIT the post, because the classmate did not agree.',
      'Groups of three. Each student writes KEEP, LIMIT, or STOP, then says why.',
    );
    expect(isPreparedClassroomActivity(choice)).toBe(true);
  });

  it('rejects six named roles in a group of four or five', () => {
    const crowded = runnable(
      'Who Keeps the Horse?',
      'Fictional scenario, inspired by this chapter. Six people argue over one horse. Groups of four or five. Roles: judge, clerk, beggar, rich man, guard, witness. Who should keep the horse? Example answer: the rich man keeps it if the horse walks to him.',
    );
    expect(isPreparedClassroomActivity(crowded)).toBe(false);
    expect(collectActivityCardIssues(withSteps(crowded)).join(' ')).toMatch(/group size/);
  });

  it('rejects a plot recap that has no example answer', () => {
    const recap = runnable(
      'Tell the horse story',
      'This activity retells the whole horse story from the first claim to the last line. The beggar arrives and the rich man arrives. The Caliph listens while the horse moves across the court. The class hears those same events again in order. Students only listen to the plot and do not make a new decision. The teacher reads the chapter summary aloud until the period ends and the known ending is finished for the class.',
    );
    expect(recap.description.length).toBeGreaterThanOrEqual(180);
    expect(recap.description.length).toBeLessThanOrEqual(1200);
    expect(isPreparedClassroomActivity(recap)).toBe(false);
    expect(collectActivityCardIssues(withSteps(recap)).join(' ')).toMatch(/example answer/);
  });

  it('accepts a skill problem and rejects a court with no numbers for that chapter', () => {
    const skill = runnable(
      'Solve the missing length',
      'Solve the missing length of a garden bed. The long side is 8 cm and the short side is 3 cm. Each student works alone. What is the perimeter? What is the area? Example answer: the perimeter is 22 cm because 8 + 3 + 8 + 3 = 22, and the area is 24 square cm.',
      'Each student calculates the perimeter and the area, then writes both answers.',
    );
    expect(skill.description.length).toBeGreaterThanOrEqual(180);
    expect(skill.description.length).toBeLessThan(450);
    expect(isPreparedClassroomActivity(skill)).toBe(true);

    const court = runnable(
      'Hold a courtroom',
      'Fictional scenario, inspired by this chapter. A courtroom hears a new dispute. Groups of four. Roles: judge, clerk, witness, guard. Should the class keep, limit, or stop the old rule? Example answer: the judge keeps the old rule because the witness agrees.',
    );
    const mathsChapter = 'Calculate the perimeter with the formula P = 2(l + w). Solve for the missing length. The sides are 4 cm and 6 cm.';
    expect(isPreparedClassroomActivity(court)).toBe(true);
    expect(collectClassroomFocusIssues(withSteps(court), mathsChapter).join(' ')).toMatch(/skill from this chapter/);
  });

  it('rejects an empty participation line', () => {
    const silent = runnable(
      'Solve the missing length',
      'Solve the missing length of a garden bed. The long side is 8 cm and the short side is 3 cm. Each student works alone. What is the perimeter? What is the area? Example answer: the perimeter is 22 cm because 8 + 3 + 8 + 3 = 22, and the area is 24 square cm.',
      '',
    );
    expect(isPreparedClassroomActivity(silent)).toBe(false);
    expect(collectActivityCardIssues(withSteps(silent)).join(' ')).toMatch(/takes part/);
  });

  it('accepts a turning point that waits for the ending and a for-example line', () => {
    const freeze = runnable(
      'Advise before the ending',
      'Do not read the last paragraph yet. The class stops at the turning point and advises the main character. What should happen next? What evidence from the chapter supports that advice? For example: tell the character to try once more, then compare that advice with the real ending after the groups have spoken.',
    );
    expect(isPreparedClassroomActivity(freeze)).toBe(true);
    expect(collectActivityCardIssues(withSteps(freeze)).join(' ')).not.toMatch(/replay or reconstruct/);

    const sample = runnable(
      'Solve the missing length',
      'Solve the missing length of a garden bed. The long side is 8 cm and the short side is 3 cm. Each student works alone. What is the perimeter? What is the area? For example: the perimeter is 22 cm because 8 + 3 + 8 + 3 = 22, and the area is 24 square cm.',
      'Each student calculates the perimeter and the area, then writes both answers.',
    );
    expect(sample.description).not.toMatch(/example answer/i);
    expect(isPreparedClassroomActivity(sample)).toBe(true);
  });

  it('accepts a textbook debate in groups of eight', () => {
    const debate = runnable(
      'Hold the printed debate',
      'Use the debate printed in this unit. Groups of 8. Each side decides one reason, the other side answers it, and a chair keeps the turn. What rule from the text supports your point? For example: the chair lets each speaker finish one reason before the other side replies.',
      'Groups of 8. Each student speaks once, then the chair writes the decision.',
    );
    expect(isPreparedClassroomActivity(debate)).toBe(true);
    expect(collectActivityCardIssues(withSteps(debate)).join(' ')).not.toMatch(/group size/);
  });

  it('shows a long chapter activity and uses the empty note only when the pack has none', () => {
    const longCase = `${'The class solves a new garden bed whose long side is 8 cm and whose short side is 3 cm. '.repeat(16)}What is the perimeter? For example: the perimeter is 22 cm.`;
    expect(longCase.length).toBeGreaterThan(1200);
    const long = runnable(
      'Solve the garden bed',
      longCase,
      'Each student calculates the perimeter, then writes the answer.',
    );
    expect(isPreparedClassroomActivity(long)).toBe(false);
    const shown = activityDayNotes({ chapterTitle: 'Perimeter', activities: [long] });
    expect(shown.title).toBe('Solve the garden bed');
    expect(shown.notes).toContain('garden bed');
    expect(shown.notes).not.toMatch(/not ready to teach/i);
    expect(shown.notes).not.toContain('Introduction: 5 minutes');
    expect(shown.notes).not.toContain('Other saved activities');

    const empty = activityDayNotes({ chapterTitle: 'Perimeter', activities: [] });
    expect(empty.notes).toMatch(/Teach the next printed application/);
    expect(empty.notes).not.toMatch(/not ready to teach/i);
    expect(empty.notes).not.toContain('Introduction: 5 minutes');
    expect(empty.notes).not.toContain('Write your own paragraph');
    expect(empty.notes.match(/Teach the next printed application/g)?.length).toBe(1);
  });

  it('asks the model to read the unit instead of picking from a format menu', () => {
    expect(CHAPTER_TEACHING_PACK_PROMPT_VERSION).toBe('chapter-teaching-pack-v10');
    const prompts = `${CHAPTER_TEACHING_PACK_SYSTEM_PROMPT}\n${CHAPTER_ACTIVITY_SYSTEM_PROMPT}`;
    expect(prompts).toMatch(/Read the whole supplied unit/i);
    expect(prompts).not.toMatch(/\n\s*\d+\.\s+Narrative/i);
    expect(prompts).not.toMatch(/keep \/ change \/ stop/i);
    expect(prompts).not.toMatch(/freeze before the resolution/i);
  });

  it('uses a prepared chapter activity on the activity day and a missing note when none is ready', () => {
    const skill = runnable(
      'Solve the missing length',
      'Solve the missing length of a garden bed. The long side is 8 cm and the short side is 3 cm. Each student works alone. What is the perimeter? What is the area? Example answer: the perimeter is 22 cm because 8 + 3 + 8 + 3 = 22, and the area is 24 square cm.',
      'Each student calculates the perimeter and the area, then writes both answers.',
    );
    const ready = activityDayNotes({
      chapterTitle: 'Perimeter',
      activities: [skill],
      preferredSliceKeys: ['s1'],
    });
    expect(ready.title).toBe('Solve the missing length');
    expect(ready.notes).toContain('8 cm');
    expect(ready.notes).not.toContain('Introduction: 5 minutes');
    expect(ready.notes).not.toContain('Students can use what');

    const saved = activityDayNotes({
      chapterTitle: 'Perimeter',
      activities: [
        runnable(
          'Write your own paragraph',
          'Write your own answer. Exercise 2 Read the following sentences and write cause and effect in the two columns. Start with the first printed sentence and finish every row the textbook gives. For example: the fall is the cause and the wound is the effect.',
        ),
      ],
    });
    expect(saved.title).toBe('Write your own paragraph');
    expect(saved.notes).toContain('cause and effect');
    expect(saved.notes).not.toMatch(/not ready to teach/i);
    expect(saved.notes).not.toContain('Introduction: 5 minutes');
    expect(saved.notes).not.toMatch(/\w{3}…/);
  });

  it('builds a 40-minute breakdown that adds up', () => {
    const blocks = periodBreakdown(40);
    expect(blocks.map((block) => block.minutes)).toEqual([5, 20, 10, 5]);
    expect(blocks.reduce((sum, block) => sum + block.minutes, 0)).toBe(40);
  });
});
