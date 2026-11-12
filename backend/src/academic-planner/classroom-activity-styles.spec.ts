import { TeachingHelpOutputSchema } from '../ai/schemas/teaching-help.schema';
import {
  ActivitySection,
  assignActivityFormatIndexes,
  buildActivityDayScript,
  pickActivityStyle,
} from './classroom-activity-styles';
import { heuristicTeachingHelp } from './teaching-help-heuristic';

const CIVIC_EXCERPT = `
# Key points
- Wearing helmets and fastening seat belts are two personal measures that can reduce fatalities and serious injuries in road accidents.
- Over-speeding and disregard for traffic rules are major causes of fatal accidents; helmets protect against head injuries and seat belts keep occupants restrained in sudden stops.
- A debate has two sides (for and against a motion), agreed rules, team leaders who open and close, turn-by-turn speakers, rebuttal, and a judge who declares the winner.
- Relative pronouns (who, whom, whose, which, that) link a noun to a relative clause; who usually refers to people, while that and which refer to things.
`;

const UNIT_5: ActivitySection[] = [
  { title: 'A Bad Dream', fact: 'Mr Karim wakes and learns the horror was only a bad dream' },
  { title: 'Modal verbs', fact: 'May and would make a formal request' },
  { title: 'Letter to the editor', fact: 'A short letter states one public concern and is signed' },
  { title: 'Daily schedule', fact: 'A daily schedule sets a time for each task' },
  { title: 'Name-place-animal game', fact: 'Groups fill name, place, animal, and thing for one letter' },
];

const UNIT_8: ActivitySection[] = [
  { title: 'Road safety', fact: 'Helmets and seat belts are two measures that can save a life' },
  { title: 'Debate', fact: 'A debate has two sides, a rebuttal, and a judge' },
  { title: 'Relative pronouns', fact: 'Who refers to people and which refers to things' },
  { title: 'Argumentative essay', fact: 'The essay needs a thesis, reasons, and an opposite view' },
  { title: 'The elephant poem', fact: 'Each blind man describes only the part of the elephant he touched' },
];

function boardLines(script: string): string[] {
  const lines = script.split('\n');
  const start = lines.findIndex((line) => line === 'Write on the board:');
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (!lines[i].trim()) break;
    out.push(lines[i].trim().replace(/^\d+\.\s*/, ''));
  }
  return out;
}

describe('classroom activity variety', () => {
  it('gives neighbouring chapters different formats', () => {
    const indexes = assignActivityFormatIndexes([0, 1, 2, 3, 4, 5, 6]);
    const openings = indexes.map(
      (formatIndex) =>
        buildActivityDayScript({
          chapterTitle: 'Unit',
          sections: UNIT_5.slice(0, 2),
          formatIndex,
        }).teacherNotes.split('\n')[0],
    );
    expect(new Set(openings).size).toBeGreaterThan(3);
    const collided = assignActivityFormatIndexes([0, 6]);
    expect(collided[0]).not.toBe(collided[1]);
  });

  it('changes the activity when the teacher asks for another idea', () => {
    const first = pickActivityStyle('Unit 8 Civic Sense|Day 20', 0).name;
    const later = pickActivityStyle('Unit 8 Civic Sense|Day 20', 1).name;
    expect(later).not.toBe(first);
  });
});

describe('heuristicTeachingHelp', () => {
  it('uses chapter recap for activity lessons and lists multiple themes', () => {
    const chapter = 'Unit 8 — Civic Sense and Civic Activities';
    const help = TeachingHelpOutputSchema.parse(
      heuristicTeachingHelp({
        lessonTitle: 'Day 20 — Unit 8 — Civic Sense and Civic Activities · Activity',
        chapterTitle: chapter,
        classLabel: 'Class 10',
        subjectName: 'English',
        objectives: [
          'Class activity: groups recall the main ideas of Unit 8 — Civic Sense and Civic Activities with a real-life example.',
        ],
        mode: 'CLASSROOM_ACTIVITY',
        chapterExcerpt: CIVIC_EXCERPT,
      }),
    );

    expect(help.classroomDelivery.activity?.title).toBe('Finish the line');
    expect(help.teacherExplanation.examples.some((line) => /Student might say:/.test(line))).toBe(true);
    expect(help.teacherExplanation.examples.join('\n')).not.toMatch(/Chapter recap|not only the first topic/i);
    const joined = [
      help.overview.teachingOverview,
      help.teacherExplanation.simpleExplanation,
      ...help.classroomDelivery.activity!.steps,
      ...help.teacherExplanation.examples,
    ].join('\n');
    expect(joined).toMatch(/helmet/i);
    expect(joined).not.toMatch(/Chapter recap|not only the first topic/i);
  });
});

describe('buildActivityDayScript', () => {
  it('uses a different format for Unit 5 and Unit 8 and keeps every section', () => {
    const [unit5Format, unit8Format] = assignActivityFormatIndexes([4, 7]);
    const unit5 = buildActivityDayScript({
      chapterTitle: 'Unit 5 — Respecting Self and Others',
      sections: UNIT_5,
      formatIndex: unit5Format,
    });
    const unit8 = buildActivityDayScript({
      chapterTitle: 'Unit 8 — Civic Sense and Civic Activities',
      sections: UNIT_8,
      formatIndex: unit8Format,
    });

    expect(unit5.teacherNotes.startsWith(unit5.formatName)).toBe(true);
    expect(unit8.teacherNotes.startsWith(unit8.formatName)).toBe(true);
    expect(unit5.formatName).not.toBe(unit8.formatName);
    for (const script of [unit5.teacherNotes, unit8.teacherNotes]) {
      expect(script).not.toMatch(/Chapter recap|not only the first topic/);
      expect(script).not.toContain('Goal:');
      for (const line of boardLines(script)) {
        expect(line.endsWith('…')).toBe(false);
        expect(line.endsWith('...')).toBe(false);
      }
    }
    expect(unit5.teacherNotes).not.toContain(unit5.objective);
    expect(unit5.teacherNotes).toMatch(/bad dream/i);
    expect(unit5.teacherNotes).toMatch(/modal verbs|letter to the editor|daily schedule|name-place-animal game/i);
    expect(unit8.teacherNotes).toMatch(/helmets|seat belts/i);
    expect(unit8.teacherNotes).toMatch(/debate|relative pronouns|argumentative essay|elephant poem/i);
    expect(unit5.teacherNotes.split('\n').includes(unit5.objective)).toBe(false);
    expect(unit8.teacherNotes.split('\n').includes(unit8.objective)).toBe(false);
  });
});
