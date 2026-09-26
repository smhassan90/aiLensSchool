import { buildTeacherUsername, teacherLocalEmail } from './teacher-accounts';

describe('teacher-accounts', () => {
  it('builds username from school and employee code', () => {
    expect(buildTeacherUsername('TPS', 'TPS-0001')).toBe('tps.t0001');
  });

  it('adds suffix when attempt > 0', () => {
    expect(buildTeacherUsername('TPS', 'TPS-0001', 2)).toBe('tps.t0001.2');
  });

  it('builds local email', () => {
    expect(teacherLocalEmail('tps.t0001', 'TPS')).toBe('tps.t0001@tps.teacher.local');
  });
});
