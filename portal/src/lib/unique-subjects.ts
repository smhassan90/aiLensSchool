import type { Subject } from "@/lib/types";

/** One row per subject name — prefers grade-specific and coded catalogue entries. */
export function uniqueSubjectsForPicker(subjects: Subject[], preferGradeId?: string): Subject[] {
  const byName = new Map<string, Subject>();
  const rank = (subject: Subject) =>
    (preferGradeId && subject.gradeId === preferGradeId ? 2 : 0) + (subject.code ? 1 : 0);

  for (const subject of subjects) {
    const key = subject.name.trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing || rank(subject) > rank(existing)) {
      byName.set(key, subject);
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** All catalogue IDs that share the same display name (duplicate subject rows). */
export function subjectIdsWithSameName(subjects: Subject[], subjectId: string): Set<string> {
  const picked = subjects.find((s) => s.id === subjectId);
  if (!picked) return new Set([subjectId]);
  const key = picked.name.trim().toLowerCase();
  const ids = subjects.filter((s) => s.name.trim().toLowerCase() === key).map((s) => s.id);
  return new Set(ids.length ? ids : [subjectId]);
}
