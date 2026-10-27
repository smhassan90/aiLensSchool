"use client";

import { formatDate } from "@/lib/utils";

export type RecoveryImpactView = {
  moved: Array<{
    lessonKey: string;
    title: string;
    from: { date: string | null; periodNumber: number | null };
    to: { date: string | null; periodNumber: number | null };
  }>;
  unchanged: Array<{ lessonKey: string; title: string }>;
  removed: Array<{ lessonKey: string; title: string; reason: string }>;
  added: Array<{ lessonKey: string; title: string }>;
  stillIncomplete: Array<{ lessonKey: string; title: string; reason: string }>;
  compressed: Array<{ lessonKey: string; title: string; beforeMinutes: number; afterMinutes: number }>;
  revisionSlotsBefore: number;
  revisionSlotsAfter: number;
  predictedCompletionBefore: string | null;
  predictedCompletionAfter: string | null;
  strategyApplied: string;
  unreportedAssumed: string[];
  unreportedInferred?: Array<{ lessonKey: string; title: string }>;
  requiresConfirmation?: Array<{ lessonKey: string; title: string; reason: string }>;
  selectedLessonKeys?: string[];
  timetableConflicts?: Array<{ code: string; message: string; date: string | null; periodNumber: number | null }>;
  constraintsUnmet: string[];
  sectionScope: string;
};

function slotLabel(slot: { date: string | null; periodNumber: number | null }) {
  if (!slot.date) return "Unscheduled";
  return `P${slot.periodNumber ?? "?"} · ${formatDate(slot.date)}`;
}

type RecoveryDiffTableProps = {
  impact: RecoveryImpactView;
};

export function RecoveryDiffTable({ impact }: RecoveryDiffTableProps) {
  return (
    <div className="space-y-4 rounded-md border p-4 text-sm">
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>Strategy: {impact.strategyApplied}</span>
        <span>
          Revision slots: {impact.revisionSlotsBefore} → {impact.revisionSlotsAfter}
        </span>
        <span>Scope: {impact.sectionScope}</span>
      </div>

      {impact.constraintsUnmet.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="font-medium">Constraints not fully met</p>
          <ul className="mt-1 list-disc pl-5">
            {impact.constraintsUnmet.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {impact.moved.length > 0 && (
        <section>
          <p className="mb-2 font-medium">Moved lessons ({impact.moved.length})</p>
          <ul className="space-y-1">
            {impact.moved.map((m) => (
              <li key={m.lessonKey}>
                {m.title}: {slotLabel(m.from)} → {slotLabel(m.to)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {impact.stillIncomplete.length > 0 && (
        <section>
          <p className="mb-2 font-medium">Still incomplete</p>
          <ul className="list-disc pl-5">
            {impact.stillIncomplete.map((r) => (
              <li key={r.lessonKey}>{r.title} ({r.reason})</li>
            ))}
          </ul>
        </section>
      )}

      {impact.selectedLessonKeys && impact.selectedLessonKeys.length > 0 && (
        <p className="text-sm">
          Selected for recovery: {impact.selectedLessonKeys.length} lesson(s)
        </p>
      )}

      {impact.requiresConfirmation && impact.requiresConfirmation.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium">Needs confirmation</p>
          <ul className="mt-1 list-disc pl-5">
            {impact.requiresConfirmation.map((r) => (
              <li key={r.lessonKey}>{r.title}: {r.reason}</li>
            ))}
          </ul>
        </div>
      )}

      {(impact.unreportedInferred?.length ?? impact.unreportedAssumed.length) > 0 && (
        <p className="text-muted-foreground text-sm">
          Inferred from missing reports (not confirmed NOT_TAUGHT):{" "}
          {(impact.unreportedInferred ?? impact.unreportedAssumed.map((k) => ({ lessonKey: k, title: k })))
            .map((u) => u.title)
            .join(", ")}
        </p>
      )}

      {impact.timetableConflicts && impact.timetableConflicts.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <p className="font-medium">Timetable conflicts</p>
          <ul className="mt-1 list-disc pl-5">
            {impact.timetableConflicts.map((c, i) => (
              <li key={`${c.code}-${i}`}>{c.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="font-medium">Completion (before)</p>
          <p>{impact.predictedCompletionBefore ? formatDate(impact.predictedCompletionBefore) : "Unavailable"}</p>
        </div>
        <div>
          <p className="font-medium">Completion (after)</p>
          <p>{impact.predictedCompletionAfter ? formatDate(impact.predictedCompletionAfter) : "Unavailable"}</p>
        </div>
      </div>

      {impact.unchanged.length > 0 && (
        <p className="text-muted-foreground">{impact.unchanged.length} lesson(s) unchanged.</p>
      )}
    </div>
  );
}
