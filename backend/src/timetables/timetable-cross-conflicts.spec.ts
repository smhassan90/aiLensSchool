import { Weekday } from '@prisma/client';
import { detectCrossVersionConflicts } from './timetable-cross-conflicts';

describe('detectCrossVersionConflicts', () => {
  const base = {
    versionId: 'v1',
    sectionId: 's1',
    kind: 'LESSON' as const,
    periodNumber: 1,
    weekday: Weekday.MONDAY,
  };

  it('detects partial time overlap for same teacher across sections', () => {
    const issues = detectCrossVersionConflicts([
      {
        ...base,
        teacherId: 't1',
        startTime: '09:00',
        endTime: '09:40',
        sectionLabel: 'Class 1 A',
      },
      {
        ...base,
        versionId: 'v2',
        sectionId: 's2',
        teacherId: 't1',
        startTime: '09:30',
        endTime: '10:10',
        sectionLabel: 'Class 2 B',
      },
    ]);
    expect(issues.some((i) => i.code === 'TEACHER_DOUBLE_BOOKED')).toBe(true);
  });

  it('allows back-to-back periods for same teacher', () => {
    const issues = detectCrossVersionConflicts([
      {
        ...base,
        teacherId: 't1',
        startTime: '09:00',
        endTime: '09:40',
      },
      {
        ...base,
        versionId: 'v2',
        sectionId: 's2',
        teacherId: 't1',
        startTime: '09:40',
        endTime: '10:20',
      },
    ]);
    expect(issues.filter((i) => i.code === 'TEACHER_DOUBLE_BOOKED')).toHaveLength(0);
  });

  it('detects section overlap in same section', () => {
    const issues = detectCrossVersionConflicts([
      {
        ...base,
        teacherId: 't1',
        startTime: '08:00',
        endTime: '08:45',
        periodNumber: 1,
      },
      {
        ...base,
        versionId: 'v1',
        teacherId: 't2',
        startTime: '08:30',
        endTime: '09:15',
        periodNumber: 2,
      },
    ]);
    expect(issues.some((i) => i.code === 'SECTION_OVERLAP')).toBe(true);
  });
});
