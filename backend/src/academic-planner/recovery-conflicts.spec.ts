import { Weekday } from '@prisma/client';
import { LessonStage, PlannerLessonKind } from '@prisma/client';
import {
  buildExternalCrossPoolForDates,
  PublishedTimetableSlice,
} from './recovery-external-timetable';
import { detectRecoveryTimetableConflicts, weekdayFromDateIso } from './recovery-conflicts';
import { ScheduleLessonDraft } from './planner-types';

describe('recovery timetable conflicts', () => {
  const lesson = (date: string, start: string, end: string): ScheduleLessonDraft => ({
    lessonKey: 'L1',
    chapterKey: 'ch1',
    sequence: 0,
    kind: PlannerLessonKind.TEACHING,
    title: 'L1',
    primaryStage: LessonStage.EXPLANATION,
    stages: [],
    objectives: [],
    portionKeys: [],
    dependsOnKeys: [],
    plannedMinutes: 40,
    scheduledDate: date,
    periodNumber: 1,
    slotStartTime: start,
    slotEndTime: end,
    frozen: false,
    isContinuation: false,
  });

  it('maps ISO date to weekday', () => {
    expect(weekdayFromDateIso('2025-01-06')).toBe(Weekday.MONDAY);
  });

  it('rejects cross-section teacher double booking', () => {
    const proposal = [lesson('2025-01-06', '09:00', '09:40')];
    const external = [
      {
        versionId: 'v2',
        sectionId: 'other-section',
        sectionLabel: 'Class B',
        weekday: Weekday.MONDAY,
        periodNumber: 1,
        kind: 'LESSON' as const,
        startTime: '09:30',
        endTime: '10:10',
        teacherId: 'teacher-1',
      },
    ];
    const conflicts = detectRecoveryTimetableConflicts(proposal, 'section-a', 'teacher-1', external);
    expect(conflicts.some((c) => c.code === 'TEACHER_DOUBLE_BOOKED')).toBe(true);
  });

  it('skips non-overlapping published versions by date', () => {
    const published: PublishedTimetableSlice[] = [
      {
        id: 'v-old',
        sectionId: 'other',
        sectionLabel: 'Other',
        effectiveFrom: new Date('2024-01-01T00:00:00.000Z'),
        effectiveTo: new Date('2024-12-31T00:00:00.000Z'),
        periods: [
          {
            weekday: Weekday.MONDAY,
            periodNumber: 1,
            kind: 'LESSON',
            startTime: '09:00',
            endTime: '09:40',
            teacherId: 't2',
          },
        ],
      },
    ];
    const pool = buildExternalCrossPoolForDates(published, 'section-a', ['2025-01-06']);
    expect(pool).toHaveLength(0);
  });
});
