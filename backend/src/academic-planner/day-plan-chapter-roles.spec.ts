import { rolesForChapterDays } from './day-plan-chapter-roles';

describe('rolesForChapterDays', () => {
  it('matches intro → reading → exercise → activity pattern for 5 days', () => {
    expect(rolesForChapterDays(5)).toEqual([
      'INTRO',
      'READING',
      'CONTINUE_READING',
      'EXERCISE',
      'ACTIVITY',
    ]);
  });

  it('handles shorter chapter allocations', () => {
    expect(rolesForChapterDays(3)).toEqual(['INTRO', 'READING', 'CONTINUE_READING']);
  });
});
