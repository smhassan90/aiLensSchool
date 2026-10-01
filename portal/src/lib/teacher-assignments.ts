import type { Teacher } from "@/lib/types";

export function teacherActiveAssignmentCount(teacher: Teacher): number {
  return (
    (teacher.classSubjects?.length ?? 0) +
    (teacher.assistantClassSubjects?.length ?? 0) +
    (teacher.classSections?.length ?? 0)
  );
}

export function teacherHasActiveAssignments(teacher: Teacher): boolean {
  return teacherActiveAssignmentCount(teacher) > 0;
}

/** Short summary for admin warnings when deactivating a teacher who still has roles. */
export function teacherAssignmentWarningSummary(teacher: Teacher): string {
  const subjects = teacher.classSubjects?.length ?? 0;
  const assistant = teacher.assistantClassSubjects?.length ?? 0;
  const homeroom = teacher.classSections?.length ?? 0;
  const parts: string[] = [];
  if (subjects) parts.push(`${subjects} subject teaching slot${subjects === 1 ? "" : "s"}`);
  if (assistant) parts.push(`${assistant} assistant slot${assistant === 1 ? "" : "s"}`);
  if (homeroom) parts.push(`${homeroom} class-teacher slot${homeroom === 1 ? "" : "s"}`);
  return parts.join(" · ");
}
