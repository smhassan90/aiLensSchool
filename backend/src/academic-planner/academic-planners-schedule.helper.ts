import { EventType, TimetablePeriodKind } from '@prisma/client';
import { TimetableResolverService } from '../timetables/timetable-resolver.service';
import { isWorkingDay, listDatesInclusive } from '../timetables/school-calendar';
import { DEFAULT_SCHOOL_TIMEZONE, dateFromIso } from '../teachers/teacher-checkin';
import { buildTeachingSlots } from './schedule-engine';
import { PlannerSettings } from './planner-types';
import { PrismaService } from '../database/prisma.service';

type DayPeriod = {
  kind: TimetablePeriodKind | 'LESSON' | 'BREAK' | 'OTHER';
  periodNumber: number | null;
  subjectId: string | null;
  startTime: string | null;
  endTime: string | null;
};

export async function buildPlannerTeachingSlots(
  deps: {
    resolver: TimetableResolverService;
    prisma: PrismaService;
  },
  input: {
    schoolId: string;
    sectionId: string;
    academicYearId: string;
    gradeHasPeriodTimetable: boolean;
    subjectId: string;
    startDate: string;
    lastTeachingDate: string;
    settings: PlannerSettings;
    timezone: string;
    section: { id: string; gradeId: string; branchId: string };
  },
) {
  const calendarDays = await deps.prisma.schoolCalendarDay.findMany({
    where: {
      schoolId: input.schoolId,
      date: { gte: dateFromIso(input.startDate), lte: dateFromIso(input.lastTeachingDate) },
    },
  });
  const holidays = await deps.prisma.event.findMany({
    where: {
      schoolId: input.schoolId,
      type: EventType.HOLIDAY,
      startDate: { lte: dateFromIso(input.lastTeachingDate) },
      endDate: { gte: dateFromIso(input.startDate) },
    },
  });

  const tz = input.timezone || DEFAULT_SCHOOL_TIMEZONE;
  const periodCache = new Map<string, DayPeriod[]>();

  for (const dateIso of listDatesInclusive(input.startDate, input.lastTeachingDate)) {
    const resolved = await deps.resolver.periodsFor(
      input.schoolId,
      input.sectionId,
      input.academicYearId,
      dateIso,
    );
    periodCache.set(dateIso, resolved.periods);
  }

  return buildTeachingSlots({
    startDate: input.startDate,
    lastTeachingDate: input.lastTeachingDate,
    sectionId: input.sectionId,
    gradeHasPeriodTimetable: input.gradeHasPeriodTimetable,
    subjectId: input.subjectId,
    workingDayFn: (dateIso) =>
      isWorkingDay(dateIso, {
        tz,
        section: input.section,
        calendarDays,
        holidayEvents: holidays,
      }),
    periodsForDate: (dateIso) => periodCache.get(dateIso) ?? [],
    fallback:
      input.settings.fallbackPeriodsPerWeek && input.settings.fallbackPeriodMinutes
        ? {
            periodsPerWeek: input.settings.fallbackPeriodsPerWeek,
            periodMinutes: input.settings.fallbackPeriodMinutes,
          }
        : undefined,
  });
}
