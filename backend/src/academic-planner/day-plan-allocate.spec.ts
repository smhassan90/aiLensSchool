import { allocateTeachingDaysPerChapter, splitParagraphsAcrossDays } from './day-plan-allocate';

describe('allocateTeachingDaysPerChapter', () => {
  it('gives at least one day per chapter and uses the teaching budget', () => {
    const days = allocateTeachingDaysPerChapter([100, 300], 10, 2);
    expect(days).toHaveLength(2);
    expect(days[0]).toBeGreaterThanOrEqual(1);
    expect(days[1]).toBeGreaterThanOrEqual(1);
    expect(days.reduce((a, b) => a + b, 0)).toBe(8);
  });
});

describe('splitParagraphsAcrossDays', () => {
  it('splits text across days', () => {
    const text = 'Para one about values.\n\nPara two about kindness.\n\nPara three about truth.';
    const parts = splitParagraphsAcrossDays(text, 2);
    expect(parts.length).toBeGreaterThan(0);
  });
});
