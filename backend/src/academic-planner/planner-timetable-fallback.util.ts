import { TimetableResolverService } from '../timetables/timetable-resolver.service';
import { PlannerSettings } from './planner-types';

export const DEFAULT_FALLBACK_PERIODS_PER_WEEK = 3;
export const DEFAULT_FALLBACK_PERIOD_MINUTES = 40;

export async function subjectHasPublishedTimetableSlots(
  resolver: TimetableResolverService,
  input: {
    schoolId: string;
    sectionId: string;
    academicYearId: string;
    subjectId: string;
    referenceDateIso: string;
  },
): Promise<boolean> {
  const grid = await resolver.weeklyGridSlots(
    input.schoolId,
    input.sectionId,
    input.academicYearId,
    input.referenceDateIso,
  );
  return grid.slots.some((s) => s.subjectId === input.subjectId);
}

/** When the grade uses period timetables but this subject has no slots, ensure fallback period settings exist. */
export function applyDefaultTimetableFallback(
  settings: PlannerSettings,
  input: {
    gradeHasPeriodTimetable: boolean;
    hasSubjectTimetableSlots: boolean;
    overridePeriodsPerWeek?: number;
    overridePeriodMinutes?: number;
  },
): { settings: PlannerSettings; applied: boolean } {
  if (!input.gradeHasPeriodTimetable || input.hasSubjectTimetableSlots) {
    return { settings, applied: false };
  }
  if (settings.fallbackPeriodsPerWeek && settings.fallbackPeriodMinutes) {
    return { settings, applied: false };
  }
  return {
    settings: {
      ...settings,
      fallbackPeriodsPerWeek:
        input.overridePeriodsPerWeek ??
        settings.fallbackPeriodsPerWeek ??
        DEFAULT_FALLBACK_PERIODS_PER_WEEK,
      fallbackPeriodMinutes:
        input.overridePeriodMinutes ??
        settings.fallbackPeriodMinutes ??
        DEFAULT_FALLBACK_PERIOD_MINUTES,
    },
    applied: true,
  };
}

export function isTimetableRequiredError(error: unknown): error is Error & { code: string } {
  return (
    error instanceof Error &&
    (error as Error & { code?: string }).code === 'TIMETABLE_REQUIRED'
  );
}
