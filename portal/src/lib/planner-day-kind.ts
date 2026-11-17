import type { PlannerLesson } from "@/lib/planner-view-model";

export type PlannerDayWord = "Reading" | "Exercises" | "Revision" | "Activity";

export function plannerDayWord(
  lesson: Pick<PlannerLesson, "kind" | "primaryStage" | "title">,
): PlannerDayWord {
  if (lesson.kind === "ACTIVITY" || lesson.primaryStage === "ACTIVITY" || /\bactivity\b/i.test(lesson.title)) {
    return "Activity";
  }
  if (
    lesson.kind === "REVISION" ||
    lesson.kind === "ASSESSMENT" ||
    lesson.primaryStage === "REVISION" ||
    /\brevision\b/i.test(lesson.title)
  ) {
    return "Revision";
  }
  if (
    lesson.primaryStage === "GUIDED_PRACTICE" ||
    lesson.primaryStage === "INDEPENDENT_PRACTICE" ||
    lesson.primaryStage === "WRITTEN_EXERCISES" ||
    /\bexercise/i.test(lesson.title)
  ) {
    return "Exercises";
  }
  return "Reading";
}

export function shortChapterName(chapterTitle: string | null | undefined): string {
  const title = (chapterTitle ?? "").replace(/\s+/g, " ").trim();
  if (!title) return "Chapter";
  const unit = title.match(/Unit\s+\d+/i);
  if (unit) return unit[0].replace(/^unit/i, "Unit");
  const chapter = title.match(/Chapter\s+\d+/i);
  if (chapter) return chapter[0].replace(/^chapter/i, "Chapter");
  return title.length <= 18 ? title : `${title.slice(0, 16).trim()}…`;
}

function focusLine(lesson: Pick<PlannerLesson, "title" | "teacherNotes">): string | null {
  const notes = lesson.teacherNotes ?? "";
  const section = notes.match(/^Section:\s*(.+)$/m)?.[1]?.trim();
  if (section && section.length >= 3 && section.length <= 80) return section;
  const after = lesson.title.split("·").slice(1).join("·").trim();
  if (after && after.length <= 70 && !/\bactivity\b/i.test(after)) return after;
  return null;
}

export function plannerDaySummary(
  lesson: Pick<PlannerLesson, "kind" | "primaryStage" | "title" | "teacherNotes">,
  chapterTitle: string | null | undefined,
): string {
  const chapter = (chapterTitle ?? "").replace(/\s+/g, " ").trim() || "this chapter";
  const word = plannerDayWord(lesson);
  const focus = focusLine(lesson);
  if (word === "Reading") {
    return focus ? `Reading of ${chapter}: ${focus}.` : `Reading of ${chapter}.`;
  }
  if (word === "Exercises") {
    return focus ? `Exercises of ${chapter}: ${focus}.` : `Exercises of ${chapter}.`;
  }
  if (word === "Revision") return `Revision of ${chapter}.`;
  return "";
}

export function activityTitle(lesson: Pick<PlannerLesson, "title">): string {
  const after = lesson.title.split("·").slice(1).join("·").trim();
  if (after) return after;
  return lesson.title.replace(/^Day\s+\d+\s+[—–-]\s+/i, "").trim() || lesson.title;
}
