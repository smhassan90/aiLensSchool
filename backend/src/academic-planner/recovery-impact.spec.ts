import { LessonStage, PlannerLessonKind } from '@prisma/client';
import { computeRecoveryImpact } from './recovery-impact';
import { ScheduleLessonDraft } from './planner-types';

function lesson(
  key: string,
  date: string,
  period: number,
  minutes = 40,
): ScheduleLessonDraft {
  return {
    lessonKey: key,
    chapterKey: 'ch1',
    sequence: 0,
    kind: PlannerLessonKind.TEACHING,
    title: `Lesson ${key}`,
    primaryStage: LessonStage.EXPLANATION,
    stages: [{ stage: LessonStage.EXPLANATION, minutes, portionKey: 'p1' }],
    objectives: [],
    portionKeys: ['p1'],
    dependsOnKeys: [],
    plannedMinutes: minutes,
    scheduledDate: date,
    periodNumber: period,
    slotStartTime: '09:00',
    slotEndTime: '09:40',
    frozen: false,
    isContinuation: false,
  };
}

describe('computeRecoveryImpact', () => {
  const meta = {
    strategyApplied: 'SLACK',
    revisionSlotsBefore: 2,
    revisionSlotsAfter: 2,
    predictedCompletionBefore: '2025-02-01',
    predictedCompletionAfter: '2025-02-02',
    unreportedAssumed: [] as string[],
    stillIncomplete: [] as Array<{ lessonKey: string; title: string; reason: string }>,
    constraintsUnmet: [] as string[],
  };

  it('reports moved lessons instead of removed plus added', () => {
    const baseline = [lesson('a', '2025-01-01', 1), lesson('b', '2025-01-02', 1)];
    const proposal = [lesson('a', '2025-01-01', 1), lesson('b', '2025-01-03', 1)];
    const impact = computeRecoveryImpact(baseline, proposal, meta);
    expect(impact.moved).toHaveLength(1);
    expect(impact.moved[0].lessonKey).toBe('b');
    expect(impact.added.filter((a) => a.lessonKey === 'b')).toHaveLength(0);
    expect(impact.removed.filter((r) => r.lessonKey === 'b')).toHaveLength(0);
  });

  it('keeps unchanged lessons in unchanged list', () => {
    const baseline = [lesson('a', '2025-01-01', 1)];
    const proposal = [lesson('a', '2025-01-01', 1)];
    const impact = computeRecoveryImpact(baseline, proposal, meta);
    expect(impact.unchanged).toHaveLength(1);
    expect(impact.moved).toHaveLength(0);
  });

  it('passes through still incomplete from meta', () => {
    const incomplete = [{ lessonKey: 'x', title: 'X', reason: 'no_capacity' }];
    const impact = computeRecoveryImpact([lesson('a', '2025-01-01', 1)], [], {
      ...meta,
      stillIncomplete: incomplete,
    });
    expect(impact.stillIncomplete).toEqual(incomplete);
  });

  it('does not fabricate completion predictions when null', () => {
    const impact = computeRecoveryImpact([], [], {
      ...meta,
      predictedCompletionBefore: null,
      predictedCompletionAfter: null,
    });
    expect(impact.predictedCompletionBefore).toBeNull();
    expect(impact.predictedCompletionAfter).toBeNull();
  });
});
