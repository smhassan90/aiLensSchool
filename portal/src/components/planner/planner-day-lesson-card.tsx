"use client";

import { BookOpen, Calendar, GripVertical, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fixDisplayText } from "@/lib/fix-display-text";
import type { PlannerLesson } from "@/lib/planner-view-model";
import { formatDate } from "@/lib/utils";

const kindStyles: Record<string, string> = {
  TEACHING: "border-l-4 border-l-sky-500 bg-gradient-to-br from-sky-50/80 to-card",
  ACTIVITY: "border-l-4 border-l-violet-500 bg-gradient-to-br from-violet-50/80 to-card",
  REVISION: "border-l-4 border-l-amber-500 bg-gradient-to-br from-amber-50/80 to-card",
  ASSESSMENT: "border-l-4 border-l-rose-500 bg-gradient-to-br from-rose-50/80 to-card",
};

type PlannerDayLessonCardProps = {
  lesson: PlannerLesson;
  readOnly?: boolean;
  onEdit?: () => void;
  onMove?: () => void;
  onTeachingHelp?: () => void;
};

export function PlannerDayLessonCard({
  lesson,
  readOnly,
  onEdit,
  onMove,
  onTeachingHelp,
}: PlannerDayLessonCardProps) {
  const title = fixDisplayText(lesson.title);
  const dayLabel =
    lesson.dayNumber != null ? `Day ${lesson.dayNumber}` : title.match(/^Day\s+\d+/i)?.[0] ?? "Day";
  const skin = kindStyles[lesson.kind] ?? kindStyles.TEACHING;

  return (
    <article className={`rounded-xl border p-4 shadow-sm ${skin}`}>
      <div className="flex items-start gap-3">
        {!readOnly && (
          <span className="mt-1 text-muted-foreground" aria-hidden>
            <GripVertical className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {dayLabel}
            </span>
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              {lesson.kind === "TEACHING" ? "Lecture" : fixDisplayText(lesson.kind)}
            </Badge>
            {lesson.date && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {formatDate(lesson.date)}
              </span>
            )}
          </div>
          <h3 className="mt-2 text-base font-semibold leading-snug text-foreground">{title}</h3>

          {lesson.objectives.length > 0 && (
            <div className="mt-3 rounded-lg bg-primary/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Today you will</p>
              <ul className="mt-2 space-y-1.5 text-sm text-foreground">
                {lesson.objectives.slice(0, 4).map((point) => (
                  <li key={point.slice(0, 48)} className="flex gap-2">
                    <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden />
                    <span>{fixDisplayText(point)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lesson.teacherNotes && (
            <div className="mt-3 rounded-lg border border-border/60 bg-background/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Steps in class
              </p>
              <p className="mt-2 text-sm leading-relaxed text-foreground/90 whitespace-pre-line">
                {fixDisplayText(lesson.teacherNotes).slice(0, 700)}
                {lesson.teacherNotes.length > 700 ? "…" : ""}
              </p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{lesson.plannedMinutes} min class time</span>
            {lesson.date && lesson.periodNumber != null && <span>Period {lesson.periodNumber}</span>}
          </div>

          {!readOnly && (
            <div className="mt-4 flex flex-wrap gap-2">
              {onEdit && (
                <button
                  type="button"
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                  onClick={onEdit}
                >
                  Edit day
                </button>
              )}
              {onMove && (
                <button
                  type="button"
                  className="rounded-md border px-3 py-1.5 text-xs font-medium"
                  onClick={onMove}
                >
                  Move date
                </button>
              )}
              {onTeachingHelp && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium"
                  onClick={onTeachingHelp}
                >
                  <Sparkles className="h-3 w-3" />
                  Help me teach
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
