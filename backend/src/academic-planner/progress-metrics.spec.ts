import { TeachingRecordStatus } from '@prisma/client';
import { computePlannerProgress } from './progress-metrics';

describe('computePlannerProgress', () => {
  it('does not count unreported lessons as missed', () => {
    const m = computePlannerProgress(
      [
        { lessonKey: 'a', scheduledDate: '2025-01-01', periodNumber: 1, recordStatus: null },
        { lessonKey: 'b', scheduledDate: '2025-01-02', periodNumber: 1, recordStatus: TeachingRecordStatus.COMPLETED },
      ],
      '2025-06-01',
      '2025-01-10',
    );
    expect(m.unreportedCount).toBe(1);
    expect(m.notTaughtCount).toBe(0);
    expect(m.completedCount).toBe(1);
  });

  it('counts partial below full completion', () => {
    const m = computePlannerProgress(
      [
        { lessonKey: 'a', scheduledDate: '2025-01-01', periodNumber: 1, recordStatus: TeachingRecordStatus.PARTIAL },
      ],
      '2025-06-01',
      '2025-01-10',
    );
    expect(m.actualCompletionPct).toBe(50);
  });
});
