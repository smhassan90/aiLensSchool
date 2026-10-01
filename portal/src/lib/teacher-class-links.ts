import type { TeacherClass } from "@/lib/types";

export function teacherClassDetailHref(cls: Pick<TeacherClass, "sectionId" | "subjectId">) {
  return `/teacher/classes/section/${cls.sectionId}/${cls.subjectId}`;
}

export function teacherClassRosterHref(
  cls: Pick<TeacherClass, "sectionId" | "subjectId" | "gradeName" | "sectionName" | "subjectName">,
) {
  const q = new URLSearchParams({
    grade: cls.gradeName,
    section: cls.sectionName,
    subject: cls.subjectName,
    subjectId: cls.subjectId,
  });
  return `/teacher/classes/section/${cls.sectionId}/students?${q.toString()}`;
}
