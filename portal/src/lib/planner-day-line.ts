import type { PlannerLesson } from "@/lib/planner-view-model";

export function shortTodayLine(lesson: PlannerLesson): string {
  const notes = lesson.teacherNotes ?? "";
  const blob = `${lesson.title} ${lesson.objectives.join(" ")} ${notes}`.toLowerCase();
  const storedScriptIsLong =
    notes.length > 180 ||
    blob.includes("indexed section") ||
    blob.includes("example for the class") ||
    blob.includes("opening (");

  if (lesson.kind === "ACTIVITY" || /\bactivity\b/.test(blob)) {
    return "Do a class activity that recalls the main ideas of this chapter.";
  }
  if (/\bexercise\b/.test(blob)) {
    return "Do the textbook exercises for this chapter.";
  }
  if (blob.includes("continue reading")) {
    return "Continue reading from where the class stopped.";
  }
  if (blob.includes("· intro") || blob.includes("section 1") || /\bintroduce\b/.test(lesson.objectives[0] ?? "")) {
    if (!storedScriptIsLong && lesson.objectives[0] && lesson.objectives[0].length < 160) {
      return lesson.objectives[0];
    }
    return "Introduce the chapter with one short example, then start reading.";
  }
  if (storedScriptIsLong || lesson.objectives.length > 1) {
    return "Read the next section with the class.";
  }
  return lesson.objectives[0] ?? "Read the next section with the class.";
}
