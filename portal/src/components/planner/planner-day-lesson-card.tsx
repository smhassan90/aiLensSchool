"use client";

import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fixDisplayText } from "@/lib/fix-display-text";
import { shortTodayLine } from "@/lib/planner-day-line";
import type { PlannerLesson } from "@/lib/planner-view-model";
import { formatDate } from "@/lib/utils";

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
  const dayLabel =
    lesson.dayNumber != null ? `Day ${lesson.dayNumber}` : lesson.title.match(/^Day\s+\d+/i)?.[0] ?? "Day";
  const kindLabel = lesson.kind === "TEACHING" ? "Lecture" : lesson.kind === "ACTIVITY" ? "Activity" : lesson.kind;

  return (
    <article className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{dayLabel}</Badge>
            <Badge variant="secondary">{kindLabel}</Badge>
            {lesson.date && (
              <span className="text-xs text-muted-foreground">
                {formatDate(lesson.date)}
                {lesson.periodNumber != null ? ` · Period ${lesson.periodNumber}` : ""}
                {` · ${lesson.plannedMinutes} min`}
              </span>
            )}
          </div>
          <p className="text-sm leading-relaxed text-foreground">{fixDisplayText(shortTodayLine(lesson))}</p>
        </div>
        {!readOnly && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {onEdit && (
              <Button type="button" size="sm" variant="outline" onClick={onEdit}>
                Edit
              </Button>
            )}
            {onMove && (
              <Button type="button" size="sm" variant="outline" onClick={onMove}>
                Move
              </Button>
            )}
            {onTeachingHelp && (
              <Button type="button" size="sm" onClick={onTeachingHelp}>
                <Sparkles className="h-3.5 w-3.5" />
                Help me teach
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
