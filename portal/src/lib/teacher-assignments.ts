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
