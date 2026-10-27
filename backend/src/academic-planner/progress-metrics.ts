import { TeachingRecordStatus } from '@prisma/client';

export type LessonProgressRow = {
  lessonKey: string;
  scheduledDate: string | null;
  periodNumber: number | null;
  recordStatus: TeachingRecordStatus | null;
};

export type PlannerProgressMetrics = {
  plannedLessonCount: number;
  reportedCount: number;
  unreportedCount: number;
  completedCount: number;
  partialCount: number;
  notTaughtCount: number;
  differentLessonCount: number;
  plannedCompletionPct: number | null;
  actualCompletionPct: number | null;
  onTrack: boolean | null;
};

export function computePlannerProgress(
  lessons: LessonProgressRow[],
  examDateIso: string,
  todayIso: string,
): PlannerProgressMetrics {
  const planned = lessons.filter((l) => l.scheduledDate);
  const plannedLessonCount = planned.length;
  const withRecord = planned.filter((l) => l.recordStatus != null);
  const reportedCount = withRecord.length;
  const unreportedCount = planned.filter(
    (l) => !l.recordStatus && l.scheduledDate && l.scheduledDate < todayIso,
  ).length;

  const completedCount = withRecord.filter((l) => l.recordStatus === TeachingRecordStatus.COMPLETED).length;
  const partialCount = withRecord.filter((l) => l.recordStatus === TeachingRecordStatus.PARTIAL).length;
  const notTaughtCount = withRecord.filter((l) => l.recordStatus === TeachingRecordStatus.NOT_TAUGHT).length;
  const differentLessonCount = withRecord.filter(
    (l) => l.recordStatus === TeachingRecordStatus.DIFFERENT_LESSON,
  ).length;

  const plannedCompletionPct =
    plannedLessonCount > 0 ? Math.round((planned.filter((l) => l.scheduledDate && l.scheduledDate <= todayIso).length / plannedLessonCount) * 100) : null;

  const actualCompletionPct =
    plannedLessonCount > 0
      ? Math.round(((completedCount + partialCount * 0.5) / plannedLessonCount) * 100)
      : null;

  let onTrack: boolean | null = null;
  if (plannedLessonCount > 0 && todayIso <= examDateIso) {
    const elapsed = planned.filter((l) => l.scheduledDate && l.scheduledDate <= todayIso).length;
    const expectedPace = elapsed / plannedLessonCount;
    const actualPace = (completedCount + partialCount * 0.5) / plannedLessonCount;
    onTrack = actualPace + 0.05 >= expectedPace;
  }

  return {
    plannedLessonCount,
    reportedCount,
    unreportedCount,
    completedCount,
    partialCount,
    notTaughtCount,
    differentLessonCount,
    plannedCompletionPct,
    actualCompletionPct,
    onTrack,
  };
}
