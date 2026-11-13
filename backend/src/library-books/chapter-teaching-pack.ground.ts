import type { ChapterTeachingPackOutput } from './schemas/chapter-teaching-pack.schema';

type SliceKeyed = { sliceKey?: string | null; title?: string };

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function occurs(chapterText: string, phrase: string): boolean {
  const needle = collapse(phrase).toLowerCase();
  if (needle.length < 8) return false;
  return collapse(chapterText).toLowerCase().includes(needle);
}

function shrinkToOccurrence(chapterText: string, phrase: string): string | null {
  const words = collapse(phrase).split(' ').filter(Boolean);
  for (let count = words.length; count >= 4; count--) {
    const candidate = words.slice(0, count).join(' ');
    if (candidate.length >= 8 && occurs(chapterText, candidate)) return candidate.slice(0, 800);
  }
  return null;
}

function excerptAtTitle(chapterText: string, title: string): string | null {
  const needle = collapse(title).toLowerCase();
  if (needle.length < 4) return null;
  const haystack = collapse(chapterText);
  const index = haystack.toLowerCase().indexOf(needle);
  if (index < 0) return null;
  const excerpt = haystack.slice(index, index + 180).trim();
  return excerpt.length >= 8 ? excerpt.slice(0, 800) : null;
}

export function assertPersistableActivities(pack: {
  readingSlices: Array<{ sliceKey: string }>;
  activities: SliceKeyed[];
  questions?: SliceKeyed[];
  revisionPoints?: SliceKeyed[];
}): void {
  const count = pack.activities.length;
  if (count < 3 || count > 5) {
    throw new Error(`Teaching pack must contain 3 to 5 activities, received ${count}`);
  }
  const keys = new Set(pack.readingSlices.map((slice) => slice.sliceKey));
  const check = (item: SliceKeyed, label: string) => {
    if (item.sliceKey && !keys.has(item.sliceKey)) {
      throw new Error(`${label} references unknown slice ${item.sliceKey}`);
    }
  };
  const seen = new Set<string>();
  for (const slice of pack.readingSlices) {
    if (seen.has(slice.sliceKey)) throw new Error(`Duplicate reading slice ${slice.sliceKey}`);
    seen.add(slice.sliceKey);
  }
  for (const activity of pack.activities) check(activity, `Activity "${activity.title ?? 'untitled'}"`);
  for (const question of pack.questions ?? []) check(question, 'A question');
  for (const point of pack.revisionPoints ?? []) check(point, 'A revision point');
}

/**
 * Reject invented textbook quotes. A reading line must occur in the saved chapter,
 * or be replaced by a shorter phrase that does occur. Unknown slice keys fail the pack.
 */
export function groundTeachingPack(
  pack: ChapterTeachingPackOutput,
  chapterText: string,
): ChapterTeachingPackOutput {
  assertPersistableActivities(pack);
  const readingSlices = pack.readingSlices.map((slice) => {
    if (occurs(chapterText, slice.readingFrom)) return slice;
    const snapped = shrinkToOccurrence(chapterText, slice.readingFrom) ?? excerptAtTitle(chapterText, slice.title);
    if (!snapped) {
      throw new Error(`Reading slice "${slice.title}" does not quote the chapter text`);
    }
    const readingTo =
      slice.readingTo && occurs(chapterText, slice.readingTo) ? slice.readingTo : null;
    return { ...slice, readingFrom: snapped, readingTo };
  });
  const grounded = { ...pack, readingSlices };
  assertPersistableActivities(grounded);
  return grounded;
}
