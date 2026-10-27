import { publishedOverlapsProposed, timetableEffectiveRangesOverlap } from './timetable-version-overlap';

describe('timetable-version-overlap', () => {
  const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  it('detects overlapping ranges', () => {
    expect(timetableEffectiveRangesOverlap(d('2025-01-01'), d('2025-06-30'), d('2025-06-01'), d('2025-12-31'))).toBe(
      true,
    );
  });

  it('rejects non-overlapping ranges', () => {
    expect(timetableEffectiveRangesOverlap(d('2025-01-01'), d('2025-03-31'), d('2025-04-01'), d('2025-12-31'))).toBe(
      false,
    );
  });

  it('treats open-ended effectiveTo as ongoing', () => {
    expect(publishedOverlapsProposed({ effectiveFrom: d('2025-01-01'), effectiveTo: null }, d('2026-01-01'))).toBe(
      true,
    );
  });

  it('excludes published version that ended before proposed start', () => {
    expect(
      publishedOverlapsProposed({ effectiveFrom: d('2025-01-01'), effectiveTo: d('2025-08-31') }, d('2025-09-01')),
    ).toBe(false);
  });
});
