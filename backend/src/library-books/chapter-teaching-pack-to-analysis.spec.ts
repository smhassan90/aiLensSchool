import { teachingPackToPlannerAnalysis } from './chapter-teaching-pack-to-analysis';
import { PlannerAnalysisSource } from '@prisma/client';

describe('teachingPackToPlannerAnalysis', () => {
  it('maps reading slices to schedule portions', () => {
    const analysis = teachingPackToPlannerAnalysis({
      chapterTitle: 'Chapter 1 — Test',
      subjectName: 'Chemistry',
      periodMinutes: 40,
      activitiesEnabled: false,
      activityCount: 0,
      pack: {
        contentHash: 'abc',
        complexity: 'MEDIUM',
        summary: 'A short chapter summary for testing purposes here.',
        teacherGuide: ['Explain atoms', 'Discuss periodic trends', 'Practice questions'],
        source: PlannerAnalysisSource.AI,
        promptVersion: 'chapter-teaching-pack-v1',
        readingSlices: [
          {
            sliceKey: 's1',
            title: 'Intro',
            readingFrom: 'Section 1.1 opening paragraph about matter.',
            readingTo: null,
            explainPoints: ['Define matter', 'List states'],
          },
          {
            sliceKey: 's2',
            title: 'Elements',
            readingFrom: 'Elements are pure substances.',
            readingTo: null,
            explainPoints: ['Element definition'],
          },
        ],
        questions: [{ sliceKey: 's1', question: 'What is matter?', format: 'ORAL' }],
        activities: [],
        revisionPoints: [{ sliceKey: null, point: 'Review key terms' }],
      },
    });

    expect(analysis.portions).toHaveLength(2);
    expect(analysis.portions[0].portionKey).toBe('p1');
    expect(analysis.portions[1].portionKey).toBe('p2');
    expect(analysis.complexity).toBe('MEDIUM');
  });
});
