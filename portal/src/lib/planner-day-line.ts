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
    const objective = lesson.objectives.find((line) => line.trim().length > 0);
    if (objective && objective.length < 180 && !/help me teach/i.test(objective)) {
      return objective;
    }
    return "Class activity: groups recall the main ideas with a real-life example.";
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

const DEFAULT_ACTIVITY_STEPS = [
  "1. Make groups of 3 or 4. Every student speaks at least once.",
  "2. Give each group one main idea you already taught in this chapter.",
  "3. In about 8 minutes, each group prepares one real-life example.",
  "4. Each group presents for about 2 minutes.",
  "5. After each group, add one point they missed and ask one short question.",
].join("\n");

export function activityConductText(lesson: PlannerLesson): string | null {
  if (lesson.kind !== "ACTIVITY" && !/\bactivity\b/i.test(lesson.title)) return null;
  const notes = lesson.teacherNotes?.trim() ?? "";
  if (notes.startsWith("How to run")) return notes;
  if (notes.length > 40 && notes.length < 700 && !/indexed section|opening \(/i.test(notes)) return notes;
  return DEFAULT_ACTIVITY_STEPS;
}
