import { LessonStage, PlannerLessonKind, TeachingRecordStatus } from '@prisma/client';
import { runRecoveryEngine } from './recovery-engine';
import { defaultPlannerSettings, PlannerSettings, ScheduleLessonDraft, TeachingSlot } from './planner-types';
import { RecoveryRecord } from './recovery-engine';

let keyCounter = 0;
const keyFactory = () => `k-${++keyCounter}`;

function slot(date: string, period: number, minutes = 40): TeachingSlot {
  return {
    date,
    periodNumber: period,
    startTime: '09:00',
    endTime: '09:40',
    minutes,
  };
}

function teachingLesson(
  key: string,
  date: string,
  period: number,
  sequence: number,
  opts?: { frozen?: boolean; chapterKey?: string },
): ScheduleLessonDraft {
  return {
    lessonKey: key,
    chapterKey: opts?.chapterKey ?? 'ch1',
    sequence,
    kind: PlannerLessonKind.TEACHING,
    title: `T ${key}`,
    primaryStage: LessonStage.EXPLANATION,
    stages: [{ stage: LessonStage.EXPLANATION, minutes: 40, portionKey: `p-${key}` }],
    objectives: [],
    portionKeys: [`p-${key}`],
    dependsOnKeys: [],
    plannedMinutes: 40,
    scheduledDate: date,
    periodNumber: period,
    slotStartTime: '09:00',
    slotEndTime: '09:40',
    frozen: opts?.frozen ?? false,
    isContinuation: false,
  };
}

const settings: PlannerSettings = {
  ...defaultPlannerSettings('2025-03-01'),
  revisionSlots: 1,
  minRevisionSlots: 0,
  lastTeachingDate: '2025-02-28',
};

function run(
  baseline: ScheduleLessonDraft[],
  records: RecoveryRecord[],
  teachingSlots: TeachingSlot[],
  todayIso = '2025-01-05',
  nowMinutes = 600,
  lessonKeys?: string[],
) {
  keyCounter = 0;
  const keys =
    lessonKeys ??
    records
      .filter((r) => r.status !== TeachingRecordStatus.COMPLETED)
      .map((r) => r.plannedLessonKey)
      .filter((k): k is string => Boolean(k));
  return runRecoveryEngine({
    todayIso,
    nowMinutes,
    baselineLessons: baseline,
    records,
    teachingSlots,
    settings,
    timetableSource: 'VERSIONED',
    options: {
      allowBufferUse: true,
      allowCompression: true,
      allowActivityRemoval: false,
      targetLessonKeys: keys.length ? keys : undefined,
    },
    keyFactory,
  });
}

describe('runRecoveryEngine', () => {
  it('schedules a missed lesson into a future slot', () => {
    const baseline = [teachingLesson('L1', '2025-01-01', 1, 0), teachingLesson('L2', '2025-01-02', 1, 1)];
    const slots = ['2025-01-01', '2025-01-02', '2025-01-06', '2025-01-07'].map((d) => slot(d, 1));
    const result = run(
      baseline,
      [
        {
          date: '2025-01-01',
          periodNumber: 1,
          plannedLessonKey: 'L1',
          status: TeachingRecordStatus.COMPLETED,
          actualLessons: [{ lessonKey: 'L1', outcome: 'DONE' }],
        },
        {
          date: '2025-01-02',
          periodNumber: 1,
          plannedLessonKey: 'L2',
          status: TeachingRecordStatus.NOT_TAUGHT,
          actualLessons: [],
        },
      ],
      slots,
      undefined,
      600,
      ['L2'],
    );
    const l2 = result.lessons.find((l) => l.lessonKey === 'L2');
    expect(l2).toBeDefined();
    expect(l2!.scheduledDate).not.toBe('2025-01-02');
    expect(l2!.scheduledDate! >= '2025-01-05').toBe(true);
  });

  it('does not reschedule completed lessons', () => {
    const baseline = [teachingLesson('L1', '2025-01-01', 1, 0), teachingLesson('L2', '2025-01-06', 1, 1)];
    const slots = ['2025-01-01', '2025-01-06', '2025-01-07'].map((d) => slot(d, 1));
    const result = run(
      baseline,
      [
        {
          date: '2025-01-01',
          periodNumber: 1,
          plannedLessonKey: 'L1',
          status: TeachingRecordStatus.COMPLETED,
          actualLessons: [{ lessonKey: 'L1', outcome: 'DONE' }],
        },
      ],
      slots,
    );
    const l1 = result.lessons.find((l) => l.lessonKey === 'L1');
    expect(l1?.scheduledDate).toBe('2025-01-01');
    expect(l1?.frozen).toBe(true);
  });

  it('handles partial lessons with remaining stages', () => {
    const baseline = [
      {
        ...teachingLesson('L1', '2025-01-01', 1, 0),
        stages: [
          { stage: LessonStage.EXPLANATION, minutes: 20, portionKey: 'p1' },
          { stage: LessonStage.GUIDED_PRACTICE, minutes: 20, portionKey: 'p2' },
        ],
        plannedMinutes: 40,
      },
    ];
    const slots = ['2025-01-01', '2025-01-06', '2025-01-07'].map((d) => slot(d, 1));
    const result = run(
      baseline,
      [
        {
          date: '2025-01-01',
          periodNumber: 1,
          plannedLessonKey: 'L1',
          status: TeachingRecordStatus.PARTIAL,
          actualLessons: [{ lessonKey: 'L1', outcome: 'PART', completedStageIndexes: [0] }],
        },
      ],
      slots,
    );
    expect(result.lessons.length).toBeGreaterThan(0);
    expect(result.impact.moved.length + result.impact.unchanged.length).toBeGreaterThan(0);
  });

  it('reports infeasibility when capacity is exhausted', () => {
    const many = Array.from({ length: 8 }, (_, i) => teachingLesson(`L${i}`, `2025-01-0${i + 1}`, 1, i));
    const slots = ['2025-01-06', '2025-01-07'].map((d) => slot(d, 1));
    const result = run(
      many,
      many.slice(0, 6).map((l) => ({
        date: l.scheduledDate!,
        periodNumber: 1,
        plannedLessonKey: l.lessonKey,
        status: TeachingRecordStatus.NOT_TAUGHT,
        actualLessons: [],
      })),
      slots,
      '2025-01-10',
    );
    expect(result.impact.stillIncomplete.length + result.impact.constraintsUnmet.length).toBeGreaterThan(0);
  });

  it('is deterministic for identical inputs', () => {
    const baseline = [teachingLesson('L1', '2025-01-01', 1, 0), teachingLesson('L2', '2025-01-02', 1, 1)];
    const slots = ['2025-01-01', '2025-01-02', '2025-01-06', '2025-01-07'].map((d) => slot(d, 1));
    const records = [
      {
        date: '2025-01-01',
        periodNumber: 1,
        plannedLessonKey: 'L1',
        status: TeachingRecordStatus.NOT_TAUGHT,
        actualLessons: [],
      },
    ];
    const a = run(baseline, records, slots);
    keyCounter = 0;
    const b = run(baseline, records, slots);
    expect(a.lessons.map((l) => [l.lessonKey, l.scheduledDate, l.periodNumber])).toEqual(
      b.lessons.map((l) => [l.lessonKey, l.scheduledDate, l.periodNumber]),
    );
  });

  it('terminates strategy search within bounded steps', () => {
    const baseline = Array.from({ length: 20 }, (_, i) =>
      teachingLesson(`L${i}`, `2025-01-${String(i + 1).padStart(2, '0')}`, 1, i),
    );
    const slots = ['2025-01-25', '2025-01-26'].map((d) => slot(d, 1));
    const result = run(
      baseline,
      baseline.map((l) => ({
        date: l.scheduledDate!,
        periodNumber: 1,
        plannedLessonKey: l.lessonKey,
        status: TeachingRecordStatus.NOT_TAUGHT,
        actualLessons: [],
      })),
      slots,
      '2025-01-20',
    );
    expect(result.impact.strategyApplied).toBe('INFEASIBLE');
  });

  it('keeps an unaffected future lesson in place when only another lesson is recovered', () => {
    const baseline = [
      teachingLesson('L1', '2025-01-01', 1, 0),
      teachingLesson('L2', '2025-01-02', 1, 1),
      teachingLesson('L3', '2025-01-10', 1, 2),
    ];
    const slots = ['2025-01-01', '2025-01-02', '2025-01-06', '2025-01-07', '2025-01-10'].map((d) => slot(d, 1));
    const result = run(
      baseline,
      [
        {
          date: '2025-01-01',
          periodNumber: 1,
          plannedLessonKey: 'L1',
          status: TeachingRecordStatus.COMPLETED,
          actualLessons: [{ lessonKey: 'L1', outcome: 'DONE' }],
        },
        {
          date: '2025-01-02',
          periodNumber: 1,
          plannedLessonKey: 'L2',
          status: TeachingRecordStatus.NOT_TAUGHT,
          actualLessons: [],
        },
      ],
      slots,
      '2025-01-05',
      600,
      ['L2'],
    );
    const l3 = result.lessons.find((l) => l.lessonKey === 'L3');
    expect(l3?.scheduledDate).toBe('2025-01-10');
    expect(result.impact.unchanged.some((u) => u.lessonKey === 'L3')).toBe(true);
  });

  it('does not treat unreported as NOT_TAUGHT without includeUnreported', () => {
    const baseline = [teachingLesson('L1', '2025-01-01', 1, 0)];
    const slots = ['2025-01-01', '2025-01-06'].map((d) => slot(d, 1));
    const result = runRecoveryEngine({
      todayIso: '2025-01-05',
      nowMinutes: 600,
      baselineLessons: baseline,
      records: [],
      teachingSlots: slots,
      settings,
      timetableSource: 'VERSIONED',
      options: { targetLessonKeys: ['L1'], includeUnreported: false },
      keyFactory,
    });
    expect(result.impact.requiresConfirmation.some((r) => r.lessonKey === 'L1')).toBe(true);
    expect(result.impact.unreportedInferred).toHaveLength(0);
  });
});
