import type { TeacherClass } from "@/lib/types";

/** Class (grade) → section → subject. */
export function compareTeacherClasses(a: TeacherClass, b: TeacherClass): number {
  const grade = a.gradeName.localeCompare(b.gradeName, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (grade !== 0) return grade;
  const section = a.sectionName.localeCompare(b.sectionName, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (section !== 0) return section;
  return a.subjectName.localeCompare(b.subjectName, undefined, { sensitivity: "base" });
}

export function sortTeacherClasses(classes: TeacherClass[]): TeacherClass[] {
  return [...classes].sort(compareTeacherClasses);
}
