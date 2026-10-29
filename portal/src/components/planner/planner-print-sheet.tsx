import { fixDisplayText } from "@/lib/fix-display-text";
import { shortTodayLine } from "@/lib/planner-day-line";
import type { PlannerLesson } from "@/lib/planner-view-model";
import { formatDate } from "@/lib/utils";

type PlannerPrintSheetProps = {
  title: string;
  subtitle: string;
  lessons: PlannerLesson[];
  chapterTitle: (chapterKey: string | null) => string | null;
};

export function PlannerPrintSheet({ title, subtitle, lessons, chapterTitle }: PlannerPrintSheetProps) {
  return (
    <section className="hidden print:block">
      <h1 className="text-xl font-semibold">{fixDisplayText(title)}</h1>
      <p className="mt-1 text-sm">{subtitle}</p>
      <ol className="mt-6 space-y-3">
        {lessons.map((lesson, index) => {
          const day = lesson.dayNumber ?? index + 1;
          const chapter = chapterTitle(lesson.chapterKey);
          const task = shortTodayLine(lesson);
          return (
            <li key={lesson.lessonKey} className="text-sm leading-relaxed">
              <span className="font-semibold">Day {day}</span>
              {lesson.date ? ` (${formatDate(lesson.date)})` : ""}
              {chapter ? ` — ${fixDisplayText(chapter)}` : ""}
              {` — ${fixDisplayText(task)}`}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
