import type { Teacher } from "@/lib/types";
import {
  teacherAssignmentWarningDetails,
  teacherHasActiveAssignments,
} from "@/lib/teacher-assignments";
import { teacherDisplayNameFromUser } from "@/lib/person-name";

export function teacherDeactivateAssignmentToast(teacher: Teacher) {
  const name = teacherDisplayNameFromUser(teacher.user, teacher.gender);
  const details = teacherAssignmentWarningDetails(teacher);
  const bulletList = details.length ? details.map((line) => `• ${line}`).join("\n") : "";
  return {
    title: "Teacher inactive — subjects still assigned",
    description: details.length
      ? `${name} is inactive but still linked to:\n${bulletList}\n\nReassign these on the teacher’s overview (Subjects & classes).`
      : `${name} is inactive but still has class links on record.\n\nReassign on the teacher’s overview.`,
  };
}

export { teacherHasActiveAssignments };
