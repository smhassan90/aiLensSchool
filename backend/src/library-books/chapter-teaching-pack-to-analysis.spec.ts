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
    expect(analysis.activitySuggestions).toEqual([]);
  });

  it('keeps saved activities when the planner default leaves activitiesEnabled false', () => {
    const analysis = teachingPackToPlannerAnalysis({
      chapterTitle: 'Unit 5',
      subjectName: 'English',
      periodMinutes: 40,
      activitiesEnabled: false,
      activityCount: 1,
      pack: {
        contentHash: 'abc',
        complexity: 'MEDIUM',
        summary: 'A short chapter summary for testing purposes here.',
        teacherGuide: ['Explain the dream', 'Model the letter', 'Check the modals'],
        source: PlannerAnalysisSource.AI,
        promptVersion: 'chapter-teaching-pack-v3',
        readingSlices: [
          {
            sliceKey: 's1',
            title: 'A Bad Dream',
            readingFrom: 'A bad dream woke the student before school.',
            readingTo: null,
            explainPoints: ['The dream is about a presentation'],
          },
        ],
        questions: [{ sliceKey: 's1', question: 'What woke the student?', format: 'ORAL' }],
        activities: [
          {
            sliceKey: null,
            title: 'Unit recap',
            description: 'Groups own each section of Unit 5.',
            participationTechnique: 'Student might say: oral communication is just talking. You add: the text uses a criterion.',
          },
        ],
        revisionPoints: [{ sliceKey: null, point: 'Review the letter form' }],
      },
    });
    expect(analysis.activitySuggestions.map((item) => item.title)).toEqual(['Unit recap']);
  });
});
