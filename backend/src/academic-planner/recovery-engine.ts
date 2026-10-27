import { LessonStage, PlannerLessonKind, TeachingRecordStatus } from '@prisma/client';
import { hmToMinutes } from '../teachers/teacher-checkin';
import {
  PackSegment,
  PlannerSettings,
  ScheduleLessonDraft,
  ScheduleSummary,
  StageSegment,
  TeachingSlot,
} from './planner-types';
import {
  computeScheduleSummary,
  defaultRevisionSlots,
  pack,
} from './schedule-engine';
import { RecoveryTimetableConflict } from './recovery-conflicts';
import { computeRecoveryImpact, RecoveryImpact } from './recovery-impact';

export type RecoverySegment = PackSegment & {
  sourceLessonKey?: string;
  sequenceOrder: number;
};

export type RecoveryRecord = {
  date: string;
  periodNumber: number;
  plannedLessonKey: string | null;
  status: TeachingRecordStatus;
  actualLessons: Array<{ lessonKey: string; outcome: string; completedStageIndexes?: number[] }>;
};

export type LessonCoverage =
  | 'COMPLETED'
  | 'PARTIAL'
  | 'NOT_TAUGHT'
  | 'DELAYED'
  | 'UNREPORTED'
  | 'SCHEDULED';

export type EligibleRecoveryLesson = {
  lessonKey: string;
  title: string;
  scheduledDate: string;
  periodNumber: number | null;
  coverage: Exclude<LessonCoverage, 'COMPLETED' | 'SCHEDULED'>;
};

export type RecoveryOptions = {
  allowBufferUse?: boolean;
  allowCompression?: boolean;
  allowActivityRemoval?: boolean;
  /** Lessons explicitly selected for recovery; must be non-empty when running from API */
  targetLessonKeys?: string[];
  /** When false, unreported past slots require confirmation instead of being scheduled */
  includeUnreported?: boolean;
  timetableConflicts?: RecoveryTimetableConflict[];
};

export type RecoveryEngineInput = {
  todayIso: string;
  nowMinutes: number;
  baselineLessons: ScheduleLessonDraft[];
  records: RecoveryRecord[];
  teachingSlots: TeachingSlot[];
  settings: PlannerSettings;
  timetableSource: ScheduleSummary['timetableSource'];
  options: RecoveryOptions;
  keyFactory?: () => string;
};

export type RecoveryEngineResult = {
  lessons: ScheduleLessonDraft[];
  summary: ScheduleSummary;
  impact: RecoveryImpact;
  examRisk: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
};

const MAX_STRATEGY_STEPS = 12;
const MAX_DISPLACE_RELEASES = 32;

/**
 * Recovery scheduling priorities (deterministic):
 * 1) Hard constraints: slot calendar, section occupancy, prerequisites order (segment sequenceOrder).
 * 2) Freeze completed history.
 * 3) Anchor all future baseline lessons; only release from the end when overflow requires displacement.
 * 4) Pack outstanding work into free slots before displacing anchored lessons.
 * 5) Revision buffer → compression → activity removal (only when options allow).
 * Tie-break: lower sequenceOrder segment first; release higher-sequence future lessons first.
 */

function rekeyRepackedLessons(
  lessons: ScheduleLessonDraft[],
  segments: RecoverySegment[],
  keyFactory: () => string,
): ScheduleLessonDraft[] {
  const usedKeys = new Set(lessons.filter((l) => l.frozen).map((l) => l.lessonKey));
  const sourceByChapter = new Map<string, string>();
  for (const s of segments) {
    if (s.sourceLessonKey && !sourceByChapter.has(s.chapterKey)) {
      sourceByChapter.set(s.chapterKey, s.sourceLessonKey);
    }
  }

  return lessons.map((lesson) => {
    if (lesson.frozen) return lesson;
    const sk =
      segments.find(
        (s) =>
          s.sourceLessonKey &&
          s.chapterKey === lesson.chapterKey &&
          lesson.stages.some((st) => st.stage === s.stage),
      )?.sourceLessonKey ?? sourceByChapter.get(lesson.chapterKey ?? '');
    if (sk && !usedKeys.has(sk)) {
      usedKeys.add(sk);
      return { ...lesson, lessonKey: sk, isContinuation: true };
    }
    const key = keyFactory();
    usedKeys.add(key);
    return { ...lesson, lessonKey: key };
  });
}

export function isRecoveryScheduleChanged(result: RecoveryEngineResult, baseline: ScheduleLessonDraft[]): boolean {
  if (result.impact.moved.length > 0) return true;
  if (result.impact.added.length > 0) return true;
  if (result.impact.unreportedAssumed.length > 0) return true;
  if (result.impact.stillIncomplete.length > 0) return true;
  if (result.impact.removed.some((r) => r.reason === 'activity_removed')) return true;
  const propByKey = new Map(result.lessons.map((l) => [l.lessonKey, l]));
  for (const b of baseline) {
    const p = propByKey.get(b.lessonKey);
    if (!p) continue;
    if (p.scheduledDate !== b.scheduledDate || p.periodNumber !== b.periodNumber) return true;
    if (p.plannedMinutes !== b.plannedMinutes) return true;
  }
  return false;
}

function lessonFromDbShape(row: {
  lessonKey: string;
  chapterKey?: string | null;
  sequence: number;
  kind: PlannerLessonKind;
  title: string;
  primaryStage: LessonStage;
  stages: unknown;
  objectives: unknown;
  portionKeys: unknown;
  dependsOnKeys: unknown;
  plannedMinutes: number;
  scheduledDate: Date | string | null;
  periodNumber: number | null;
  slotStartTime: string | null;
  slotEndTime: string | null;
  frozen: boolean;
  isContinuation: boolean;
}): ScheduleLessonDraft {
  const scheduledDate =
    row.scheduledDate instanceof Date
      ? row.scheduledDate.toISOString().slice(0, 10)
      : row.scheduledDate
        ? String(row.scheduledDate).slice(0, 10)
        : null;
  return {
    lessonKey: row.lessonKey,
    chapterKey: row.chapterKey ?? null,
    sequence: row.sequence,
    kind: row.kind,
    title: row.title,
    primaryStage: row.primaryStage,
    stages: (row.stages as StageSegment[]) ?? [],
    objectives: (row.objectives as string[]) ?? [],
    portionKeys: (row.portionKeys as string[]) ?? [],
    dependsOnKeys: (row.dependsOnKeys as string[]) ?? [],
    plannedMinutes: row.plannedMinutes,
    scheduledDate,
    periodNumber: row.periodNumber,
    slotStartTime: row.slotStartTime,
    slotEndTime: row.slotEndTime,
    frozen: row.frozen,
    isContinuation: row.isContinuation,
  };
}

export function dbLessonsToDrafts(
  lessons: Array<{
    lessonKey: string;
    plannerChapterId: string | null;
    sequence: number;
    kind: PlannerLessonKind;
    title: string;
    primaryStage: LessonStage;
    stages: unknown;
    objectives: unknown;
    portionKeys: unknown;
    dependsOnKeys: unknown;
    plannedMinutes: number;
    scheduledDate: Date | null;
    periodNumber: number | null;
    slotStartTime: string | null;
    slotEndTime: string | null;
    frozen: boolean;
    isContinuation: boolean;
  }>,
  chapterKeyById: Map<string, string>,
): ScheduleLessonDraft[] {
  return lessons.map((l) =>
    lessonFromDbShape({
      ...l,
      chapterKey: l.plannerChapterId ? chapterKeyById.get(l.plannerChapterId) ?? null : null,
    }),
  );
}

function isSlotEnded(lesson: ScheduleLessonDraft, todayIso: string, nowMinutes: number): boolean {
  if (!lesson.scheduledDate) return false;
  if (lesson.scheduledDate < todayIso) return true;
  if (lesson.scheduledDate === todayIso && lesson.slotEndTime) {
    return nowMinutes >= hmToMinutes(lesson.slotEndTime);
  }
  return false;
}

function recordForLesson(lesson: ScheduleLessonDraft, records: RecoveryRecord[]): RecoveryRecord | undefined {
  return records.find(
    (r) =>
      r.date === lesson.scheduledDate &&
      r.periodNumber === (lesson.periodNumber ?? 0) &&
      (r.plannedLessonKey === lesson.lessonKey || !r.plannedLessonKey),
  );
}

export function getLessonCoverage(
  lesson: ScheduleLessonDraft,
  records: RecoveryRecord[],
  todayIso: string,
  nowMinutes: number,
): LessonCoverage {
  const rec = recordForLesson(lesson, records);
  if (rec) {
    if (rec.status === TeachingRecordStatus.COMPLETED) return 'COMPLETED';
    if (rec.status === TeachingRecordStatus.PARTIAL) return 'PARTIAL';
    if (rec.status === TeachingRecordStatus.NOT_TAUGHT) return 'NOT_TAUGHT';
    if (rec.status === TeachingRecordStatus.DELAYED) return 'DELAYED';
  }
  if (isSlotEnded(lesson, todayIso, nowMinutes)) return 'UNREPORTED';
  if (lesson.scheduledDate && lesson.scheduledDate >= todayIso) return 'SCHEDULED';
  return 'COMPLETED';
}

export function listEligibleRecoveryLessons(
  baselineLessons: ScheduleLessonDraft[],
  records: RecoveryRecord[],
  todayIso: string,
  nowMinutes: number,
): EligibleRecoveryLesson[] {
  const eligible: EligibleRecoveryLesson[] = [];
  for (const lesson of baselineLessons) {
    if (!lesson.scheduledDate) continue;
    const cov = getLessonCoverage(lesson, records, todayIso, nowMinutes);
    if (cov === 'COMPLETED' || cov === 'SCHEDULED') continue;
    eligible.push({
      lessonKey: lesson.lessonKey,
      title: lesson.title,
      scheduledDate: lesson.scheduledDate,
      periodNumber: lesson.periodNumber,
      coverage: cov,
    });
  }
  return eligible.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
}

function isTargetLesson(lessonKey: string, targetLessonKeys: string[] | undefined): boolean {
  if (!targetLessonKeys || targetLessonKeys.length === 0) return true;
  return targetLessonKeys.includes(lessonKey);
}

function stagesToSegments(
  lesson: ScheduleLessonDraft,
  stages: StageSegment[],
  continuation: boolean,
  sequenceOrder: number,
): RecoverySegment[] {
  const chapterTitle = lesson.title.includes(':') ? lesson.title.split(':')[0]!.trim() : lesson.title;
  return stages.map((st, idx) => ({
    chapterKey: lesson.chapterKey ?? 'unknown',
    chapterTitle,
    portionKey: st.portionKey,
    portionTitle: lesson.title,
    activityKey: st.activityKey,
    stage: st.stage,
    minutes: st.minutes,
    required: lesson.kind !== PlannerLessonKind.ACTIVITY,
    compressible: st.stage !== LessonStage.ASSESSMENT && lesson.kind !== PlannerLessonKind.ASSESSMENT,
    floorMinutes: Math.max(5, Math.ceil(st.minutes * 0.7)),
    optional: st.stage === LessonStage.ACTIVITY || lesson.kind === PlannerLessonKind.ACTIVITY,
    sourceLessonKey: lesson.lessonKey,
    sequenceOrder: sequenceOrder + idx,
  }));
}

function remainingStages(lesson: ScheduleLessonDraft, rec: RecoveryRecord): StageSegment[] {
  const entry = rec.actualLessons.find((a) => a.lessonKey === lesson.lessonKey);
  const done = new Set(entry?.completedStageIndexes ?? []);
  return lesson.stages.filter((_, i) => !done.has(i));
}

function compressSegments(segments: RecoverySegment[], ratio: number): RecoverySegment[] {
  return segments.map((s) => {
    if (!s.compressible) return s;
    const next = Math.max(s.floorMinutes, Math.ceil(s.minutes * ratio));
    return { ...s, minutes: next };
  });
}

function dropOptionalActivities(segments: RecoverySegment[]): {
  kept: RecoverySegment[];
  dropped: Array<{ lessonKey: string; title: string }>;
} {
  const dropped: Array<{ lessonKey: string; title: string }> = [];
  const kept = segments.filter((s) => {
    if (s.optional && s.stage === LessonStage.ACTIVITY) {
      if (s.sourceLessonKey) dropped.push({ lessonKey: s.sourceLessonKey, title: s.portionTitle ?? 'Activity' });
      return false;
    }
    return true;
  });
  return { kept, dropped };
}

function packRecovery(
  segments: RecoverySegment[],
  teachingSlots: TeachingSlot[],
  revisionSlotCount: number,
  frozen: ScheduleLessonDraft[],
  settings: PlannerSettings,
  keyFactory: () => string,
): { lessons: ScheduleLessonDraft[]; overflow: PackSegment[] } {
  const usedSourceKeys = new Set(frozen.map((f) => f.lessonKey));
  let segIndex = 0;
  const nextKey = () => {
    while (segIndex < segments.length) {
      const sk = segments[segIndex]?.sourceLessonKey;
      segIndex++;
      if (sk && !usedSourceKeys.has(sk)) {
        usedSourceKeys.add(sk);
        return sk;
      }
    }
    return keyFactory();
  };

  const keyedSegments: PackSegment[] = segments.map((s) => ({ ...s }));
  const rev = revisionSlotCount;
  const teaching = teachingSlots.slice(0, Math.max(0, teachingSlots.length - rev));
  const revision = teachingSlots.slice(Math.max(0, teachingSlots.length - rev));
  return pack(keyedSegments, teaching, revision, frozen, {
    minChapterStartMinutes: settings.minChapterStartMinutes,
    fallbackMinutes: settings.fallbackPeriodMinutes ?? 40,
    keyFactory: nextKey,
  });
}

function buildInitialState(
  sorted: ScheduleLessonDraft[],
  input: RecoveryEngineInput,
): {
  frozen: ScheduleLessonDraft[];
  outstanding: RecoverySegment[];
  anchoredFuture: ScheduleLessonDraft[];
  unreportedAssumed: string[];
  unreportedInferred: Array<{ lessonKey: string; title: string }>;
  requiresConfirmation: Array<{ lessonKey: string; title: string; reason: string }>;
} {
  const opts = input.options;
  const frozen: ScheduleLessonDraft[] = [];
  const outstanding: RecoverySegment[] = [];
  const unreportedAssumed: string[] = [];
  const unreportedInferred: Array<{ lessonKey: string; title: string }> = [];
  const requiresConfirmation: Array<{ lessonKey: string; title: string; reason: string }> = [];
  const anchoredFuture: ScheduleLessonDraft[] = [];
  let seq = 0;

  for (const lesson of sorted) {
    if (!lesson.scheduledDate) continue;
    const cov = getLessonCoverage(lesson, input.records, input.todayIso, input.nowMinutes);
    const past = lesson.scheduledDate < input.todayIso || isSlotEnded(lesson, input.todayIso, input.nowMinutes);

    if (lesson.scheduledDate >= input.todayIso && lesson.kind !== PlannerLessonKind.REVISION) {
      anchoredFuture.push(lesson);
    }

    if (past) {
      if (cov === 'COMPLETED') {
        frozen.push({ ...lesson, frozen: true });
        continue;
      }
      if (!isTargetLesson(lesson.lessonKey, opts.targetLessonKeys)) {
        frozen.push({ ...lesson, frozen: true });
        continue;
      }
      if (cov === 'UNREPORTED') {
        if (opts.includeUnreported) {
          unreportedAssumed.push(lesson.lessonKey);
          unreportedInferred.push({ lessonKey: lesson.lessonKey, title: lesson.title });
          outstanding.push(...stagesToSegments(lesson, lesson.stages, true, seq));
          seq += 100;
        } else {
          requiresConfirmation.push({
            lessonKey: lesson.lessonKey,
            title: lesson.title,
            reason: 'unreported_requires_confirmation',
          });
          frozen.push({ ...lesson, frozen: true });
        }
        continue;
      }
      if (cov === 'PARTIAL') {
        const rec = recordForLesson(lesson, input.records)!;
        outstanding.push(...stagesToSegments(lesson, remainingStages(lesson, rec), true, seq));
        seq += 100;
        frozen.push({ ...lesson, frozen: true });
        continue;
      }
      if (cov === 'NOT_TAUGHT' || cov === 'DELAYED') {
        outstanding.push(...stagesToSegments(lesson, lesson.stages, true, seq));
        seq += 100;
        continue;
      }
    }
  }

  for (const lesson of anchoredFuture) {
    frozen.push({ ...lesson, frozen: true });
  }

  return { frozen, outstanding, anchoredFuture, unreportedAssumed, unreportedInferred, requiresConfirmation };
}

function releaseNextFutureLesson(
  anchoredFuture: ScheduleLessonDraft[],
  releasedKeys: Set<string>,
  frozen: ScheduleLessonDraft[],
  outstanding: RecoverySegment[],
  seqStart: number,
): { frozen: ScheduleLessonDraft[]; outstanding: RecoverySegment[]; seq: number; released: boolean } {
  const candidates = [...anchoredFuture].sort((a, b) => b.sequence - a.sequence);
  const next = candidates.find((l) => !releasedKeys.has(l.lessonKey));
  if (!next) {
    return { frozen, outstanding, seq: seqStart, released: false };
  }
  releasedKeys.add(next.lessonKey);
  const nextFrozen = frozen.filter((f) => f.lessonKey !== next.lessonKey);
  const nextOutstanding = [
    ...outstanding,
    ...stagesToSegments(next, next.stages, false, seqStart),
  ];
  return { frozen: nextFrozen, outstanding: nextOutstanding, seq: seqStart + 100, released: true };
}

function runPackWithDisplacement(
  input: RecoveryEngineInput,
  initialFrozen: ScheduleLessonDraft[],
  initialOutstanding: RecoverySegment[],
  anchoredFuture: ScheduleLessonDraft[],
  keyFactory: () => string,
): {
  packed: ReturnType<typeof packRecovery>;
  segments: RecoverySegment[];
  revisionSlots: number;
  revisionBefore: number;
  strategy: string;
  droppedActivities: Array<{ lessonKey: string; title: string }>;
} {
  const opts = input.options;
  const slotsFromToday = input.teachingSlots.filter((s) => s.date >= input.todayIso);
  const revisionBefore = defaultRevisionSlots(slotsFromToday.length, input.settings.revisionSlots);
  const minRevision = input.settings.minRevisionSlots ?? 1;

  let revisionSlots = revisionBefore;
  let strategy = 'SLACK';
  let segments = [...initialOutstanding].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  let frozen = [...initialFrozen];
  let droppedActivities: Array<{ lessonKey: string; title: string }> = [];
  const releasedKeys = new Set<string>();
  let displaceSteps = 0;
  let seq = segments.length * 100;

  let packed = packRecovery(segments, slotsFromToday, revisionSlots, frozen, input.settings, keyFactory);
  let steps = 0;

  while (packed.overflow.some((o) => o.required) && steps < MAX_STRATEGY_STEPS + MAX_DISPLACE_RELEASES) {
    steps++;
    if (!packed.overflow.some((o) => o.required)) break;

    const release = releaseNextFutureLesson(anchoredFuture, releasedKeys, frozen, segments, seq);
    if (release.released) {
      frozen = release.frozen;
      segments = release.outstanding.sort((a, b) => a.sequenceOrder - b.sequenceOrder);
      seq = release.seq;
      displaceSteps++;
      strategy = displaceSteps === 1 ? 'DISPLACE' : strategy;
      packed = packRecovery(segments, slotsFromToday, revisionSlots, frozen, input.settings, keyFactory);
      if (displaceSteps < MAX_DISPLACE_RELEASES) continue;
    }

    if (strategy === 'SLACK' || strategy === 'DISPLACE') {
      if (opts.allowBufferUse !== false && revisionSlots > minRevision) {
        revisionSlots = Math.max(minRevision, revisionSlots - 1);
        strategy = 'BUFFER';
        packed = packRecovery(segments, slotsFromToday, revisionSlots, frozen, input.settings, keyFactory);
        continue;
      }
    }
    if (strategy === 'BUFFER' && opts.allowCompression !== false) {
      segments = compressSegments(segments, 0.85);
      strategy = 'COMPRESSION';
      packed = packRecovery(segments, slotsFromToday, revisionSlots, frozen, input.settings, keyFactory);
      continue;
    }
    if (strategy === 'COMPRESSION' && opts.allowActivityRemoval) {
      const drop = dropOptionalActivities(segments);
      segments = drop.kept;
      droppedActivities = drop.dropped;
      strategy = 'ACTIVITY_REMOVAL';
      packed = packRecovery(segments, slotsFromToday, revisionSlots, frozen, input.settings, keyFactory);
      continue;
    }
    strategy = 'INFEASIBLE';
    break;
  }

  return { packed, segments, revisionSlots, revisionBefore, strategy, droppedActivities };
}

export function runRecoveryEngine(input: RecoveryEngineInput): RecoveryEngineResult {
  const opts = input.options;
  const keyFactory = input.keyFactory ?? (() => `rec-${Math.random().toString(36).slice(2, 9)}`);
  const sorted = [...input.baselineLessons].sort((a, b) => a.sequence - b.sequence);

  const {
    frozen: initialFrozen,
    outstanding: initialOutstanding,
    anchoredFuture,
    unreportedAssumed,
    unreportedInferred,
    requiresConfirmation,
  } = buildInitialState(sorted, input);

  const slotsFromToday = input.teachingSlots.filter((s) => s.date >= input.todayIso);

  const { packed, segments, revisionSlots, revisionBefore, strategy, droppedActivities } = runPackWithDisplacement(
    input,
    initialFrozen,
    initialOutstanding,
    anchoredFuture,
    keyFactory,
  );

  const rekeyed = rekeyRepackedLessons(packed.lessons, segments, keyFactory);

  const stillIncomplete = packed.overflow
    .filter((o) => o.required)
    .map((o) => ({
      lessonKey: o.portionKey ?? o.chapterKey,
      title: o.portionTitle ?? o.chapterTitle,
      reason: 'no_capacity',
    }));

  const baselineSummary = computeScheduleSummary(
    input.teachingSlots,
    revisionBefore,
    sorted,
    [],
    input.timetableSource,
  );

  const summary = computeScheduleSummary(
    slotsFromToday,
    revisionSlots,
    rekeyed,
    packed.overflow,
    input.timetableSource,
  );

  const constraintsUnmet: string[] = [];
  if (strategy === 'INFEASIBLE' || summary.feasibility === 'INFEASIBLE') {
    constraintsUnmet.push('Required learning could not fit before the exam deadline.');
  }
  if (unreportedInferred.length) {
    constraintsUnmet.push(
      `${unreportedInferred.length} lesson(s) inferred from missing reports (not confirmed NOT_TAUGHT).`,
    );
  }
  if (requiresConfirmation.length) {
    constraintsUnmet.push(
      `${requiresConfirmation.length} unreported lesson(s) need teacher confirmation before recovery can include them.`,
    );
  }
  if (opts.timetableConflicts?.length) {
    constraintsUnmet.push(`${opts.timetableConflicts.length} timetable conflict(s) must be resolved before approval.`);
  }

  const impact = computeRecoveryImpact(sorted, rekeyed, {
    strategyApplied: strategy,
    revisionSlotsBefore: revisionBefore,
    revisionSlotsAfter: revisionSlots,
    predictedCompletionBefore: baselineSummary.predictedCompletionDate,
    predictedCompletionAfter: summary.predictedCompletionDate,
    unreportedAssumed,
    unreportedInferred,
    requiresConfirmation,
    selectedLessonKeys: opts.targetLessonKeys ?? [],
    timetableConflicts: opts.timetableConflicts ?? [],
    stillIncomplete,
    constraintsUnmet,
    removedActivities: droppedActivities,
  });

  const examRisk =
    summary.feasibility === 'INFEASIBLE' ? 'HIGH' : summary.feasibility === 'AT_RISK' ? 'MEDIUM' : 'LOW';

  return {
    lessons: rekeyed.sort((a, b) => a.sequence - b.sequence),
    summary,
    impact,
    examRisk,
  };
}
