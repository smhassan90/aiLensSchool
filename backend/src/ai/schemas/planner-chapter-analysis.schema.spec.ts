import { LessonStage } from '@prisma/client';
import { PlannerChapterAnalysisSchema } from './planner-chapter-analysis.schema';

describe('PlannerChapterAnalysisSchema', () => {
  it('accepts a minimal valid analysis', () => {
    const parsed = PlannerChapterAnalysisSchema.parse({
      complexity: 'LOW',
      objectives: ['Understand fractions', 'Add like denominators', 'Solve word problems'],
      portions: [
        {
          portionKey: 'p1',
          title: 'Introduction',
          contentAnchor: 'A fraction represents parts of a whole',
          kind: 'CONCEPT',
          stages: [{ stage: LessonStage.EXPLANATION, minutes: 20 }],
          minMinutes: 15,
          maxMinutes: 40,
          dependsOn: [],
          exerciseCount: 0,
          compressible: false,
        },
      ],
      activitySuggestions: [],
      revisionMinutes: 0,
      assessmentMinutes: 0,
    });
    expect(parsed.portions[0].portionKey).toBe('p1');
  });
});
