import {
  applyDefaultTimetableFallback,
  DEFAULT_FALLBACK_PERIOD_MINUTES,
  DEFAULT_FALLBACK_PERIODS_PER_WEEK,
} from './planner-timetable-fallback.util';
import { defaultPlannerSettings } from './planner-types';

describe('planner-timetable-fallback.util', () => {
  it('applies default fallback when period timetable has no subject slots', () => {
    const base = defaultPlannerSettings('2027-03-22');
    const { settings, applied } = applyDefaultTimetableFallback(base, {
      gradeHasPeriodTimetable: true,
      hasSubjectTimetableSlots: false,
    });
    expect(applied).toBe(true);
    expect(settings.fallbackPeriodsPerWeek).toBe(DEFAULT_FALLBACK_PERIODS_PER_WEEK);
    expect(settings.fallbackPeriodMinutes).toBe(DEFAULT_FALLBACK_PERIOD_MINUTES);
  });

  it('does not override explicit fallback settings', () => {
    const base = {
      ...defaultPlannerSettings('2027-03-22'),
      fallbackPeriodsPerWeek: 5,
      fallbackPeriodMinutes: 45,
    };
    const { applied } = applyDefaultTimetableFallback(base, {
      gradeHasPeriodTimetable: true,
      hasSubjectTimetableSlots: false,
    });
    expect(applied).toBe(false);
  });
});
