import { ObservationMatch, TeachingRecordStatus } from '@prisma/client';

export type LessonDisplayStatus =
  | 'SCHEDULED'
  | 'TEACHER_CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'DIFFERENT_LESSON'
  | 'NOT_TAUGHT'
  | 'NOT_YET_REPORTED'
  | 'NEEDS_ATTENTION';

export function lessonDisplayStatus(input: {
  recordStatus: TeachingRecordStatus | null;
  periodStarted: boolean;
  periodEnded: boolean;
  attentionReasons: string[];
}): LessonDisplayStatus {
  if (input.attentionReasons.length > 0) {
    return 'NEEDS_ATTENTION';
  }
  if (!input.recordStatus) {
    if (input.periodEnded) return 'NOT_YET_REPORTED';
    return 'SCHEDULED';
  }
  switch (input.recordStatus) {
    case TeachingRecordStatus.CONFIRMED:
      return 'TEACHER_CONFIRMED';
    case TeachingRecordStatus.IN_PROGRESS:
      return 'IN_PROGRESS';
    case TeachingRecordStatus.COMPLETED:
      return 'COMPLETED';
    case TeachingRecordStatus.PARTIAL:
      return 'PARTIALLY_COMPLETED';
    case TeachingRecordStatus.DIFFERENT_LESSON:
      return 'DIFFERENT_LESSON';
    case TeachingRecordStatus.NOT_TAUGHT:
      return 'NOT_TAUGHT';
    case TeachingRecordStatus.DELAYED:
      return 'NOT_YET_REPORTED';
    default:
      return 'SCHEDULED';
  }
}

export function observationNeedsAttention(match: ObservationMatch): boolean {
  return match === ObservationMatch.DIFFERENT_LESSON || match === ObservationMatch.NO_LESSON_OBSERVED;
}
