import {
  buildTeacherUsername,
  schoolPhonesMatch,
  teacherLocalEmail,
} from './teacher-accounts';

describe('teacher-accounts', () => {
  it('builds username from school code and phone', () => {
    expect(buildTeacherUsername('TPS', '0321-23234543')).toBe('tps.032123234543');
  });

  it('adds a suffix when attempt > 0', () => {
    expect(buildTeacherUsername('TPS', '032123234543', 2)).toBe('tps.032123234543.2');
  });

  it('builds local email', () => {
    expect(teacherLocalEmail('tps.032123234543', 'TPS')).toBe(
      'tps.032123234543@tps.teacher.local',
    );
  });

  it('matches phones by digits only', () => {
    expect(schoolPhonesMatch('0321-23234543', '032123234543')).toBe(true);
    expect(schoolPhonesMatch('032123234543', '03219999999')).toBe(false);
  });
});
