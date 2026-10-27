import { LessonStage, TimetablePeriodKind, Weekday } from '@prisma/client';
import { buildTeachingSlots, generateSchedule } from './schedule-engine';
import { defaultPlannerSettings } from './planner-types';

describe('schedule-engine', () => {
  it('builds teaching slots for period timetable subjects', () => {
    const { slots } = buildTeachingSlots({
      startDate: '2026-04-06',
      lastTeachingDate: '2026-04-10',
      sectionId: 'sec',
      gradeHasPeriodTimetable: true,
      subjectId: 'sub-math',
      workingDayFn: () => ({ working: true, timetableWeekday: Weekday.MONDAY, reason: null }),
      periodsForDate: () => [
        {
          kind: TimetablePeriodKind.LESSON,
          periodNumber: 1,
          subjectId: 'sub-math',
          startTime: '08:00',
          endTime: '08:45',
        },
      ],
    });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].minutes).toBe(45);
  });

  it('packs chapter segments into lessons', () => {
    const teachingSlots = [
      { date: '2026-04-06', periodNumber: 1, startTime: '08:00', endTime: '08:45', minutes: 45 },
      { date: '2026-04-07', periodNumber: 1, startTime: '08:00', endTime: '08:45', minutes: 45 },
      { date: '2026-04-08', periodNumber: 1, startTime: '08:00', endTime: '08:45', minutes: 45 },
    ];
    const settings = { ...defaultPlannerSettings('2026-04-20'), revisionSlots: 1 };
    const { lessons, summary } = generateSchedule({
      chapters: [
        {
          chapterKey: 'ch-1',
          title: 'Fractions',
          required: true,
          activitiesEnabled: false,
          activities: [],
          analysis: {
            objectives: ['Understand fractions'],
            assessmentMinutes: 0,
            portions: [
              {
                portionKey: 'p1',
                title: 'Intro',
                compressible: false,
                stages: [{ stage: LessonStage.INTRODUCTION, minutes: 30 }],
              },
            ],
          },
        },
      ],
      teachingSlots,
      settings,
      timetableSource: 'LEGACY',
      keyFactory: () => 'lesson-1',
    });
    expect(lessons.length).toBeGreaterThan(0);
    expect(summary.feasibility).toBeDefined();
  });
});
