import {
  buildChapterRecapActivity,
  buildExpertTeachingDayPlan,
  isIndexLikeText,
} from './day-plan-teacher-script';
import { TeachingPackForAnalysis } from '../library-books/chapter-teaching-pack-to-analysis';

describe('buildExpertTeachingDayPlan', () => {
  it('uses teach points and concrete questions instead of generic filler', () => {
    const { objectives, teacherNotes } = buildExpertTeachingDayPlan({
      chapterTitle: 'Social and Moral Values',
      subjectName: 'Religious Studies',
      dayInChapter: 2,
      totalDaysInChapter: 5,
      portionText:
        'Allah’s mercy extends to all creation. Students learn how mercy appears in worship and daily conduct.',
      portionLabel: 'Glory of the Lord',
      isFirstDayOfChapter: false,
      explainPoints: ['The chapter is Chapter 2 and its theme is Social and Moral Values.'],
      questions: ['How does mercy show in daily life?'],
      packSummary: 'Chapter on values.',
    });

    expect(objectives.some((o) => o.includes('mercy'))).toBe(true);
    expect(teacherNotes).toContain('Ask before class ends');
    expect(teacherNotes).toContain('How does mercy show');
    expect(teacherNotes).not.toContain('ReligiousStudiesIX-X.pdf');
    expect(teacherNotes).not.toContain('theme is Social and Moral Values');
  });
});

describe('buildChapterRecapActivity', () => {
  it('avoids index-walk pack activities', () => {
    const pack: TeachingPackForAnalysis = {
      contentHash: 'h',
      complexity: 'MEDIUM',
      summary: 'Values across religions.',
      teacherGuide: ['Respect places of worship'],
      source: 'AI',
      promptVersion: '1',
      readingSlices: [
        {
          sliceKey: 's1',
          title: 'Glory of the Lord',
          readingFrom: 'index page 31',
          readingTo: null,
          explainPoints: ['God’s glory in nature'],
        },
      ],
      questions: [{ sliceKey: 's1', question: 'Name one sign of mercy in Islam.', format: 'ORAL' }],
      activities: [
        {
          sliceKey: null,
          title: 'Index walk and page hunt',
          description: 'Students circle and read page numbers.',
          participationTechnique: 'Circle game',
        },
      ],
      revisionPoints: [{ sliceKey: null, point: 'Piety and truth in daily life' }],
    };

    const recap = buildChapterRecapActivity({
      chapterTitle: 'Chapter 2 — Social and Moral Values',
      subjectName: 'Religious Studies',
      pack,
    });

    expect(isIndexLikeText(recap.activityTitle)).toBe(false);
    expect(recap.teacherNotes.toLowerCase()).not.toContain('page hunt');
    expect(recap.objectives.some((o) => o.includes('recall'))).toBe(true);
  });
});
