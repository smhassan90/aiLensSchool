import { buildUrduTeachingGuide } from './teaching-help-urdu';
import { heuristicTeachingHelp } from './teaching-help-heuristic';
import { TeachingHelpOutputSchema } from '../ai/schemas/teaching-help.schema';

describe('buildUrduTeachingGuide', () => {
  it('returns Urdu steps and student template for chapter recap', () => {
    const help = TeachingHelpOutputSchema.parse(
      heuristicTeachingHelp({
        lessonTitle: 'Day 20 · Activity',
        chapterTitle: 'Unit 8 — Civic Sense',
        classLabel: 'Class 10',
        subjectName: 'English',
        objectives: ['Chapter recap'],
        mode: 'CLASSROOM_ACTIVITY',
        chapterExcerpt: '- Helmets reduce injuries.\n- Debate needs two sides.\n',
      }),
    );
    const urdu = buildUrduTeachingGuide(help);
    expect(urdu.steps.length).toBeGreaterThanOrEqual(3);
    expect(urdu.studentWorkTemplate).toMatch(/طلبہ/);
    expect(urdu.teachingOverview).toMatch(/یونٹ/);
  });
});
