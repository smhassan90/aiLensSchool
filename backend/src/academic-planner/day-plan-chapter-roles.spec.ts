import { rolesForChapterDays } from './day-plan-chapter-roles';

describe('rolesForChapterDays', () => {
  it('keeps intro and activity and splits the rest half reading, half exercise', () => {
    expect(rolesForChapterDays(10)).toEqual([
      'INTRO',
      'READING',
      'CONTINUE_READING',
      'CONTINUE_READING',
      'CONTINUE_READING',
      'EXERCISE',
      'EXERCISE',
      'EXERCISE',
      'EXERCISE',
      'ACTIVITY',
    ]);
  });

  it('gives the odd leftover day to reading', () => {
    expect(rolesForChapterDays(5)).toEqual([
      'INTRO',
      'READING',
      'CONTINUE_READING',
      'EXERCISE',
      'ACTIVITY',
    ]);
  });

  it('uses intro and activity when only two days are available', () => {
    expect(rolesForChapterDays(2)).toEqual(['INTRO', 'ACTIVITY']);
    expect(rolesForChapterDays(4)).toEqual(['INTRO', 'READING', 'EXERCISE', 'ACTIVITY']);
  });
});
