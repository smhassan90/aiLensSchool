import { detectSubjectProfile, heuristicChapterAnalysis } from './subject-profiles';

describe('subject-profiles', () => {
  it('detects mathematics', () => {
    expect(detectSubjectProfile('Mathematics')).toBe('MATHEMATICS');
  });

  it('builds heuristic analysis with portions', () => {
    const analysis = heuristicChapterAnalysis({
      chapterTitle: 'Fractions',
      chapterText: 'A fraction is a part of a whole. '.repeat(50),
      subjectName: 'Mathematics',
      periodMinutes: 40,
      activityCount: 1,
      activitiesEnabled: false,
    });
    expect(analysis.portions.length).toBeGreaterThan(0);
    expect(analysis.objectives.length).toBeGreaterThan(0);
  });
});
