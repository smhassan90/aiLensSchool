"use client";

import type { TimetableValidationIssue } from "@/services/timetables.service";
import { formatStatusLabel } from "@/lib/display-labels";

type TimetableValidationListProps = {
  issues: TimetableValidationIssue[];
};

export function TimetableValidationList({ issues }: TimetableValidationListProps) {
  if (!issues.length) {
    return <p className="text-sm text-muted-foreground">No validation issues.</p>;
  }

  const blocking = issues.filter((i) => i.severity === "BLOCKING");
  const warnings = issues.filter((i) => i.severity === "WARNING");

  return (
    <div className="space-y-4">
      {blocking.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-destructive">Blocking errors ({blocking.length})</p>
          <ul className="space-y-1 text-sm">
            {blocking.map((issue, idx) => (
              <li key={`b-${idx}`} className="rounded border border-destructive/30 bg-destructive/5 px-2 py-1">
                {issue.weekday ? `${formatStatusLabel(issue.weekday)} · ` : ""}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-amber-800 dark:text-amber-200">
            Warnings ({warnings.length})
          </p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {warnings.map((issue, idx) => (
              <li key={`w-${idx}`} className="rounded border border-border px-2 py-1">
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
