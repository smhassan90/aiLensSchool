import { ScheduleLessonDraft } from './planner-types';
import { RecoveryTimetableConflict } from './recovery-conflicts';

export type LessonSlotRef = { date: string | null; periodNumber: number | null };

export type RecoveryImpact = {
  moved: Array<{
    lessonKey: string;
    title: string;
    from: LessonSlotRef;
    to: LessonSlotRef;
  }>;
  unchanged: Array<{ lessonKey: string; title: string; slot: LessonSlotRef }>;
  removed: Array<{ lessonKey: string; title: string; reason: string }>;
  added: Array<{ lessonKey: string; title: string; slot: LessonSlotRef; continuation: boolean }>;
  stillIncomplete: Array<{ lessonKey: string; title: string; reason: string }>;
  compressed: Array<{ lessonKey: string; title: string; beforeMinutes: number; afterMinutes: number }>;
  revisionSlotsBefore: number;
  revisionSlotsAfter: number;
  predictedCompletionBefore: string | null;
  predictedCompletionAfter: string | null;
  strategyApplied: string;
  unreportedAssumed: string[];
  unreportedInferred: Array<{ lessonKey: string; title: string }>;
  requiresConfirmation: Array<{ lessonKey: string; title: string; reason: string }>;
  selectedLessonKeys: string[];
  timetableConflicts: RecoveryTimetableConflict[];
  constraintsUnmet: string[];
  sectionScope: string;
};

function slotRef(lesson: ScheduleLessonDraft): LessonSlotRef {
  return { date: lesson.scheduledDate, periodNumber: lesson.periodNumber };
}

function slotEqual(a: LessonSlotRef, b: LessonSlotRef): boolean {
  return a.date === b.date && a.periodNumber === b.periodNumber;
}

export function computeRecoveryImpact(
  baseline: ScheduleLessonDraft[],
  proposal: ScheduleLessonDraft[],
  meta: {
    strategyApplied: string;
    revisionSlotsBefore: number;
    revisionSlotsAfter: number;
    predictedCompletionBefore: string | null;
    predictedCompletionAfter: string | null;
    unreportedAssumed: string[];
    unreportedInferred?: Array<{ lessonKey: string; title: string }>;
    requiresConfirmation?: Array<{ lessonKey: string; title: string; reason: string }>;
    selectedLessonKeys?: string[];
    timetableConflicts?: RecoveryTimetableConflict[];
    stillIncomplete: Array<{ lessonKey: string; title: string; reason: string }>;
    constraintsUnmet: string[];
    removedActivities?: Array<{ lessonKey: string; title: string }>;
  },
): RecoveryImpact {
  const baseByKey = new Map(baseline.map((l) => [l.lessonKey, l]));
  const propByKey = new Map(proposal.map((l) => [l.lessonKey, l]));
  const baseFuture = baseline.filter((l) => l.scheduledDate && l.kind !== 'REVISION');
  const propFuture = proposal.filter((l) => l.scheduledDate && l.kind !== 'REVISION');

  const moved: RecoveryImpact['moved'] = [];
  const unchanged: RecoveryImpact['unchanged'] = [];
  const removed: RecoveryImpact['removed'] = [];
  const added: RecoveryImpact['added'] = [];

  for (const lesson of propFuture) {
    const prev = baseByKey.get(lesson.lessonKey);
    if (!prev) {
      added.push({
        lessonKey: lesson.lessonKey,
        title: lesson.title,
        slot: slotRef(lesson),
        continuation: lesson.isContinuation,
      });
      continue;
    }
    const from = slotRef(prev);
    const to = slotRef(lesson);
    if (!slotEqual(from, to)) {
      moved.push({ lessonKey: lesson.lessonKey, title: lesson.title, from, to });
    } else {
      unchanged.push({ lessonKey: lesson.lessonKey, title: lesson.title, slot: to });
    }
  }

  for (const lesson of baseFuture) {
    if (!propByKey.has(lesson.lessonKey)) {
      const dropped = meta.removedActivities?.find((r) => r.lessonKey === lesson.lessonKey);
      removed.push({
        lessonKey: lesson.lessonKey,
        title: lesson.title,
        reason: dropped ? 'activity_removed' : 'not_in_proposal',
      });
    }
  }

  const compressed: RecoveryImpact['compressed'] = [];
  for (const lesson of propFuture) {
    const prev = baseByKey.get(lesson.lessonKey);
    if (!prev) continue;
    if (prev.plannedMinutes > lesson.plannedMinutes) {
      compressed.push({
        lessonKey: lesson.lessonKey,
        title: lesson.title,
        beforeMinutes: prev.plannedMinutes,
        afterMinutes: lesson.plannedMinutes,
      });
    }
  }

  return {
    moved,
    unchanged,
    removed,
    added,
    stillIncomplete: meta.stillIncomplete,
    compressed,
    revisionSlotsBefore: meta.revisionSlotsBefore,
    revisionSlotsAfter: meta.revisionSlotsAfter,
    predictedCompletionBefore: meta.predictedCompletionBefore,
    predictedCompletionAfter: meta.predictedCompletionAfter,
    strategyApplied: meta.strategyApplied,
    unreportedAssumed: meta.unreportedAssumed,
    unreportedInferred: meta.unreportedInferred ?? meta.unreportedAssumed.map((k) => {
      const lesson = baseByKey.get(k);
      return { lessonKey: k, title: lesson?.title ?? k };
    }),
    requiresConfirmation: meta.requiresConfirmation ?? [],
    selectedLessonKeys: meta.selectedLessonKeys ?? [],
    timetableConflicts: meta.timetableConflicts ?? [],
    constraintsUnmet: meta.constraintsUnmet,
    sectionScope: 'single_section',
  };
}
