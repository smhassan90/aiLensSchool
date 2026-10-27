"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { academicPlannerService } from "@/services/academic-planner.service";
import { formatDate } from "@/lib/utils";
import { formatStatusLabel } from "@/lib/display-labels";

type RecoveryRequestDialogProps = {
  plannerId: string;
  onSubmit: (body: {
    lessonKeys: string[];
    reason: string;
    reasonNote?: string;
    includeUnreported: boolean;
    allowBufferUse: boolean;
    allowCompression: boolean;
    allowActivityRemoval: boolean;
  }) => void;
  isPending: boolean;
};

export function RecoveryRequestDialog({ plannerId, onSubmit, isPending }: RecoveryRequestDialogProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["recovery-eligible", plannerId],
    queryFn: () => academicPlannerService.listRecoveryEligible(plannerId),
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [includeUnreported, setIncludeUnreported] = useState(false);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const unreportedInSelection = data?.eligible.filter(
    (e) => selected.has(e.lessonKey) && e.coverage === "UNREPORTED",
  );

  const canSubmit =
    selected.size > 0 &&
    reason.length > 0 &&
    (!unreportedInSelection?.length || includeUnreported);

  return (
    <div className="space-y-4 rounded-md border p-4">
      <p className="text-sm text-muted-foreground">
        Select lessons to recover from the approved plan. The engine will only reschedule what is
        necessary.
      </p>

      {isLoading && <p className="text-sm">Loading eligible lessons…</p>}

      {data && data.eligible.length === 0 && (
        <p className="text-sm text-muted-foreground">No lessons are eligible for recovery right now.</p>
      )}

      {data && data.eligible.length > 0 && (
        <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
          {data.eligible.map((lesson) => (
            <li key={lesson.lessonKey} className="flex items-start gap-2">
              <input
                type="checkbox"
                id={`rec-${lesson.lessonKey}`}
                checked={selected.has(lesson.lessonKey)}
                onChange={() => toggle(lesson.lessonKey)}
                className="mt-1"
              />
              <label htmlFor={`rec-${lesson.lessonKey}`} className="cursor-pointer">
                <span className="font-medium">{lesson.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatDate(lesson.scheduledDate)} · P{lesson.periodNumber ?? "?"} ·{" "}
                  {formatStatusLabel(lesson.coverage)}
                  {lesson.coverage === "UNREPORTED" ? " (no teaching report)" : ""}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <Label htmlFor="recovery-reason">Recovery reason</Label>
        <select
          id="recovery-reason"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          <option value="">Select a reason…</option>
          {data?.changeReasons.map((r) => (
            <option key={r} value={r}>{formatStatusLabel(r)}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="recovery-note">Notes (optional)</Label>
        <textarea
          id="recovery-note"
          className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={reasonNote}
          onChange={(e) => setReasonNote(e.target.value)}
        />
      </div>

      {unreportedInSelection && unreportedInSelection.length > 0 && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeUnreported}
            onChange={(e) => setIncludeUnreported(e.target.checked)}
            className="mt-1"
          />
          <span>
            Include {unreportedInSelection.length} lesson(s) with no report. These are inferred as
            not taught, not confirmed NOT_TAUGHT records.
          </span>
        </label>
      )}

      <Button
        type="button"
        disabled={!canSubmit || isPending}
        onClick={() =>
          onSubmit({
            lessonKeys: [...selected],
            reason,
            reasonNote: reasonNote.trim() || undefined,
            includeUnreported,
            allowBufferUse: true,
            allowCompression: true,
            allowActivityRemoval: false,
          })
        }
      >
        {isPending ? "Generating…" : "Generate recovery proposal"}
      </Button>
    </div>
  );
}
