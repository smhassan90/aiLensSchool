import { TeachingHelpOutputSchema } from '../ai/schemas/teaching-help.schema';
import { activityConductNotes } from './day-plan-chapter-roles';
import { pickActivityStyle } from './classroom-activity-styles';
import { heuristicTeachingHelp } from './teaching-help-heuristic';

const CIVIC_EXCERPT = `
# Key points
- Wearing helmets and fastening seat belts are two personal measures that can reduce fatalities and serious injuries in road accidents.
- Over-speeding and disregard for traffic rules are major causes of fatal accidents; helmets protect against head injuries and seat belts keep occupants restrained in sudden stops.
- A debate has two sides (for and against a motion), agreed rules, team leaders who open and close, turn-by-turn speakers, rebuttal, and a judge who declares the winner.
- Relative pronouns (who, whom, whose, which, that) link a noun to a relative clause; who usually refers to people, while that and which refer to things.
`;

describe('classroom activity variety', () => {
  it('does not give every chapter the same group task', () => {
    const openings = new Set(
      ['Civic sense', 'Photosynthesis', 'Fractions', 'The poem', 'Trade', 'Climate', 'Grammar', 'Water'].map(
        (chapter) => activityConductNotes(chapter, ['Students learn one clear idea from the pages.']).split('\n')[0],
      ),
    );
    expect(openings.size).toBeGreaterThan(3);
    for (const notes of openings) {
      expect(notes.toLowerCase()).not.toContain('groups of 3 or 4');
    }
  });

  it('changes the activity when the teacher asks for another idea', () => {
    const first = pickActivityStyle('Unit 8 Civic Sense|Day 20', 0).name;
    const later = pickActivityStyle('Unit 8 Civic Sense|Day 20', 1).name;
    expect(later).not.toBe(first);
  });
});

describe('heuristicTeachingHelp', () => {
  it('stays short and does not repeat the chapter title or quote every key point', () => {
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

    const body = [
      help.overview.teachingOverview,
      ...help.learningObjectives,
      help.teacherExplanation.simpleExplanation,
      ...help.classroomDelivery.activity!.steps,
    ].join('\n');

    expect(body.includes(chapter)).toBe(false);
    expect(body).not.toMatch(/Station \d/);
    expect(body.toLowerCase()).not.toContain('groups of 3 or 4');
    expect(help.classroomDelivery.activity!.steps.length).toBeLessThanOrEqual(4);
    expect(help.overview.teachingOverview.length).toBeLessThan(280);
    expect(help.teacherExplanation.simpleExplanation.length).toBeLessThan(320);
  });
});
