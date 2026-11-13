import { formatSavedActivityNotes, selectSavedActivity, type SavedActivity } from './saved-activity-plan';
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
      'Draft letter to the editor',
      'Persuasive essay on the journey',
      'Poem performance',
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
      expect(notes).toContain('Every student produces an individual result');
      expect(notes).toContain('Duration: 40 minutes');
      expect(notes).not.toMatch(/class period set aside/i);
      expect(notes).not.toMatch(/What did this activity ask you to do/i);
      expect(notes).not.toMatch(/Each group owns one section/);
      const blocks = [...notes.matchAll(/- (.+): (\d+) minutes\./g)].map((match) => Number(match[2]));
      expect(blocks.reduce((sum, minutes) => sum + minutes, 0)).toBe(40);
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

  it('builds a 40-minute breakdown that adds up', () => {
    const blocks = periodBreakdown(40);
    expect(blocks.map((block) => block.minutes)).toEqual([5, 20, 10, 5]);
    expect(blocks.reduce((sum, block) => sum + block.minutes, 0)).toBe(40);
  });
});
