import type { PlannerLesson } from "@/lib/planner-view-model";

export function shortTodayLine(lesson: PlannerLesson): string {
  const objective = lesson.objectives.find((line) => line.trim().length > 0)?.trim() ?? "";
  if (objective && objective.length < 180) return objective;
  if (lesson.kind === "ACTIVITY" || /\bactivity\b/i.test(lesson.title)) {
    return "Classroom activity";
  }
  if (/\bexercise\b/i.test(`${lesson.title} ${objective}`)) {
    return "Do the textbook exercises for this chapter.";
  }
  if (/continue reading/i.test(lesson.title)) {
    return "Continue reading from where the class stopped.";
  }
  return objective || "Read the next section with the class.";
}

/** Stored lesson instructions. Never replaced with a generic activity catalog. */
export function activityConductText(lesson: PlannerLesson): string | null {
  if (lesson.kind !== "ACTIVITY" && !/\bactivity\b/i.test(lesson.title)) return null;
  const notes = lesson.teacherNotes?.trim() ?? "";
  return notes || null;
}
