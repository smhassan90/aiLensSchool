import { AttendanceStatus } from '@prisma/client';
import {
  dateFromIso,
  hmToMinutes,
  normalizeHm,
  shouldFinalizeAbsences,
  statusFromCheckIn,
  zonedDateIso,
  zonedMinutes,
} from './teacher-checkin';

const TZ = 'Asia/Karachi';

describe('teacher check-in cut-offs', () => {
  it('normalizes HH:mm', () => {
    expect(normalizeHm('8:15')).toBe('08:15');
    expect(normalizeHm('09:00')).toBe('09:00');
    expect(normalizeHm('25:00')).toBeNull();
    expect(hmToMinutes('08:15')).toBe(8 * 60 + 15);
  });

  it('reads school-local time in Asia/Karachi', () => {
    // 03:14 UTC = 08:14 PK
    expect(zonedMinutes(new Date('2026-09-13T03:14:00.000Z'), TZ)).toBe(8 * 60 + 14);
    expect(zonedDateIso(new Date('2026-09-13T03:14:00.000Z'), TZ)).toBe('2026-09-13');
    expect(dateFromIso('2026-09-13').toISOString()).toBe('2026-09-13T00:00:00.000Z');
  });

  it('marks present before late cut-off, late until absent cut-off', () => {
    expect(statusFromCheckIn(new Date('2026-09-13T03:14:00.000Z'), '08:15', '09:00', TZ)).toBe(
      AttendanceStatus.PRESENT,
    );
    expect(statusFromCheckIn(new Date('2026-09-13T03:15:00.000Z'), '08:15', '09:00', TZ)).toBe(
      AttendanceStatus.LATE,
    );
    expect(statusFromCheckIn(new Date('2026-09-13T03:59:00.000Z'), '08:15', '09:00', TZ)).toBe(
      AttendanceStatus.LATE,
    );
    expect(statusFromCheckIn(new Date('2026-09-13T04:00:00.000Z'), '08:15', '09:00', TZ)).toBe(
      AttendanceStatus.ABSENT,
    );
  });

  it('finalizes absences after the absent cut-off, not before', () => {
    expect(shouldFinalizeAbsences('2026-09-13', new Date('2026-09-13T03:59:00.000Z'), TZ, '09:00')).toBe(
      false,
    );
    expect(shouldFinalizeAbsences('2026-09-13', new Date('2026-09-13T04:00:00.000Z'), TZ, '09:00')).toBe(
      true,
    );
    expect(shouldFinalizeAbsences('2026-09-12', new Date('2026-09-13T03:00:00.000Z'), TZ, '09:00')).toBe(
      true,
    );
    expect(shouldFinalizeAbsences('2026-09-14', new Date('2026-09-13T10:00:00.000Z'), TZ, '09:00')).toBe(
      false,
    );
  });
});
