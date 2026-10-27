const OPEN_END = new Date('9999-12-31T00:00:00.000Z');

/** True when two timetable versions could both be in effect on at least one calendar day. */
export function timetableEffectiveRangesOverlap(
  aFrom: Date,
  aTo: Date | null,
  bFrom: Date,
  bTo: Date | null,
): boolean {
  const aEnd = aTo ?? OPEN_END;
  const bEnd = bTo ?? OPEN_END;
  return aFrom <= bEnd && bFrom <= aEnd;
}

/** Published version overlaps a draft batch item published with `proposedEffectiveFrom`. */
export function publishedOverlapsProposed(
  published: { effectiveFrom: Date; effectiveTo: Date | null },
  proposedEffectiveFrom: Date,
): boolean {
  return timetableEffectiveRangesOverlap(
    proposedEffectiveFrom,
    null,
    published.effectiveFrom,
    published.effectiveTo,
  );
}
