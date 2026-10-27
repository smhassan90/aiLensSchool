"use client";

import { AlertTriangle, Info } from "lucide-react";
import type { PlannerVersionPayload } from "@/services/academic-planner.service";
import { formatStatusLabel } from "@/lib/display-labels";

type PlannerStatusBannerProps = {
  payload: PlannerVersionPayload;
};

export function PlannerStatusBanner({ payload }: PlannerStatusBannerProps) {
  const summary = payload.version.summary;
  const feasibility = summary?.feasibility;
  const showFeasibility =
    feasibility && feasibility !== "FEASIBLE";

  const versionComment = payload.version.decisionComment?.trim();
  const versionStatus = payload.version.status;

  const topWarnings = payload.warnings.slice(0, 3);

  if (
    !showFeasibility &&
    !versionComment &&
    topWarnings.length === 0 &&
    !payload.version.examRisk
  ) {
    return null;
  }

  return (
    <div className="space-y-2">
      {showFeasibility && summary && (
        <div
          className={`flex gap-2 rounded-md border px-3 py-2 text-sm ${
            feasibility === "INFEASIBLE"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100"
          }`}
          role="status"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">
              Schedule {formatStatusLabel(feasibility).toLowerCase()}
            </p>
            {summary.shortfallMinutes > 0 && (
              <p className="text-xs opacity-90">
                About {summary.shortfallMinutes} minutes short of capacity.
                {summary.unscheduledLessonCount > 0 &&
                  ` ${summary.unscheduledLessonCount} lesson(s) still unscheduled.`}
              </p>
            )}
          </div>
        </div>
      )}

      {payload.version.examRisk && payload.version.examRisk !== "NONE" && (
        <div className="flex gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Exam risk: <strong>{formatStatusLabel(payload.version.examRisk)}</strong>
          </p>
        </div>
      )}

      {(versionStatus === "REJECTED" || versionStatus === "CHANGES_REQUESTED") &&
        versionComment && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
            <p className="font-medium">{formatStatusLabel(versionStatus)}</p>
            <p className="mt-1 text-muted-foreground">{versionComment}</p>
          </div>
        )}

      {topWarnings.map((w) => (
        <div
          key={`${w.code}-${w.lessonKey ?? w.chapterKey ?? w.message}`}
          className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        >
          {w.message}
        </div>
      ))}
    </div>
  );
}
