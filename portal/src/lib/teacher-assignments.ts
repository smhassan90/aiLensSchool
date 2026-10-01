import type { Teacher } from "@/lib/types";
import { gradeClassLabel } from "@/lib/utils";

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

/** Human-readable lines for deactivate warnings (class · section · subject). */
export function teacherAssignmentWarningDetails(teacher: Teacher): string[] {
  const lines: string[] = [];

  for (const item of teacher.classSubjects ?? []) {
    const cls = gradeClassLabel(item.section);
    const sec = item.section?.name?.trim() || "—";
    const sub = item.subject?.name ?? "Subject";
    lines.push(`${cls} · Section ${sec} · ${sub} (subject teacher)`);
  }
  for (const item of teacher.assistantClassSubjects ?? []) {
    const cls = gradeClassLabel(item.section);
    const sec = item.section?.name?.trim() || "—";
    const sub = item.subject?.name ?? "Subject";
    lines.push(`${cls} · Section ${sec} · ${sub} (assistant)`);
  }
  for (const section of teacher.classSections ?? []) {
    const cls = gradeClassLabel(section);
    const sec = section.name?.trim() || "—";
    lines.push(`${cls} · Section ${sec} (class teacher)`);
  }

  if (!lines.length && teacher.assignments?.length) {
    for (const row of teacher.assignments) {
      const sec = row.sectionName ? `Section ${row.sectionName}` : "—";
      if (row.role === "Class teacher") {
        lines.push(`${row.className} · ${sec} (class teacher)`);
      } else if (row.subject) {
        lines.push(`${row.className} · ${sec} · ${row.subject} (${row.role.toLowerCase()})`);
      }
    }
  }

  return lines;
}
