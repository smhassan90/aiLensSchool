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
