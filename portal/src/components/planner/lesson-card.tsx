"use client";

import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PlannerLesson } from "@/lib/planner-view-model";
import { formatStatusLabel } from "@/lib/display-labels";

type LessonCardProps = {
  lesson: PlannerLesson;
  compact?: boolean;
  onMove?: () => void;
  onTeachingHelp?: () => void;
};

export function LessonCard({ lesson, compact, onMove, onTeachingHelp }: LessonCardProps) {
  return (
    <div
      className={`rounded-md border border-border bg-card text-card-foreground shadow-sm ${
        compact ? "p-2 text-xs" : "p-3 text-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug">{lesson.title}</p>
          {!compact && lesson.objectives.length > 0 && (
            <p className="mt-1 text-muted-foreground line-clamp-2">
              {lesson.objectives[0]}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {lesson.frozen && (
            <span className="inline-flex text-muted-foreground" title="Frozen">
              <Lock className="h-3.5 w-3.5" aria-hidden />
            </span>
          )}
          <Badge variant="secondary" className="text-[10px]">
            {formatStatusLabel(lesson.primaryStage)}
          </Badge>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground">
        <span>{lesson.plannedMinutes} min</span>
        {lesson.isContinuation && (
          <Badge variant="outline" className="text-[10px]">Continuation</Badge>
        )}
        {lesson.date && lesson.periodNumber != null && (
          <span>
            P{lesson.periodNumber}
            {lesson.startTime ? ` · ${lesson.startTime}` : ""}
          </span>
        )}
      </div>
      {(onTeachingHelp || onMove) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {onTeachingHelp && (
            <button
              type="button"
              className="text-xs font-medium text-primary underline"
              onClick={onTeachingHelp}
            >
              Help me teach
            </button>
          )}
          {onMove && (
            <button
              type="button"
              className="text-xs font-medium text-primary underline"
              onClick={onMove}
            >
              Move…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
