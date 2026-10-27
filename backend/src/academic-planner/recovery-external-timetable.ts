import { TimetablePeriodKind, Weekday } from '@prisma/client';
import { dateFromIso } from '../teachers/teacher-checkin';
import { publishedOverlapsProposed } from '../timetables/timetable-version-overlap';
import { CrossCheckPeriod } from '../timetables/timetable-cross-conflicts';

export type PublishedTimetableSlice = {
  id: string;
  sectionId: string;
  sectionLabel: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  periods: Array<{
    weekday: Weekday;
    periodNumber: number | null;
    kind: TimetablePeriodKind;
    startTime: string | null;
    endTime: string | null;
    teacherId: string | null;
  }>;
};

export function buildExternalCrossPoolForDates(
  published: PublishedTimetableSlice[],
  excludeSectionId: string,
  datesIso: string[],
): CrossCheckPeriod[] {
  const uniqueDates = [...new Set(datesIso)];
  const pool: CrossCheckPeriod[] = [];

  for (const version of published) {
    if (version.sectionId === excludeSectionId) continue;
    const activeOnAnyDate = uniqueDates.some((d) =>
      publishedOverlapsProposed(
        { effectiveFrom: version.effectiveFrom, effectiveTo: version.effectiveTo },
        dateFromIso(d),
      ),
    );
    if (!activeOnAnyDate) continue;

    for (const p of version.periods) {
      if (p.kind !== TimetablePeriodKind.LESSON) continue;
      pool.push({
        versionId: version.id,
        sectionId: version.sectionId,
        sectionLabel: version.sectionLabel,
        weekday: p.weekday,
        periodNumber: p.periodNumber,
        kind: 'LESSON',
        startTime: p.startTime,
        endTime: p.endTime,
        teacherId: p.teacherId,
      });
    }
  }

  return pool;
}
