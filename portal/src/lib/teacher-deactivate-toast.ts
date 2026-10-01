import type { Teacher } from "@/lib/types";
import { teacherAssignmentWarningSummary, teacherHasActiveAssignments } from "@/lib/teacher-assignments";
import { teacherDisplayNameFromUser } from "@/lib/person-name";

export function teacherDeactivateAssignmentToast(teacher: Teacher) {
  const name = teacherDisplayNameFromUser(teacher.user, teacher.gender);
  const summary = teacherAssignmentWarningSummary(teacher);
  return {
    title: "Teacher inactive — subjects still assigned",
    description: summary
      ? `${name} is inactive but still linked to: ${summary}.\n\nReassign those classes on Teaching assignments or this teacher’s profile.`
      : `${name} is inactive but still has class links on record.\n\nReassign on Teaching assignments or this teacher’s profile.`,
  };
}

export { teacherHasActiveAssignments };
