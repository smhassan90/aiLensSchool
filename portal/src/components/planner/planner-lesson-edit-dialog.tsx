"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { PlannerLesson } from "@/lib/planner-view-model";

type PlannerLessonEditDialogProps = {
  open: boolean;
  lesson: PlannerLesson | null;
  revision: number;
  onClose: () => void;
  onSave: (body: {
    expectedRevision: number;
    title?: string;
    objectives?: string[];
    notes?: string;
    kind?: PlannerLesson["kind"];
  }) => void;
  onRegenerate: (opts: { regenerateActivity?: boolean }) => void;
  saving?: boolean;
};

export function PlannerLessonEditDialog({
  open,
  lesson,
  revision,
  onClose,
  onSave,
  onRegenerate,
  saving,
}: PlannerLessonEditDialogProps) {
  const [title, setTitle] = useState("");
  const [objectivesText, setObjectivesText] = useState("");
  const [notes, setNotes] = useState("");
  const [kind, setKind] = useState<PlannerLesson["kind"]>("TEACHING");

  useEffect(() => {
    if (!lesson) return;
    setTitle(lesson.title);
    setObjectivesText(lesson.objectives.join("\n"));
    setNotes(lesson.teacherNotes ?? "");
    setKind(lesson.kind);
  }, [lesson]);

  if (!open || !lesson) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-card p-5 shadow-lg">
        <h2 className="text-lg font-semibold">Edit day plan</h2>
        <p className="mt-1 text-sm text-muted-foreground">{lesson.title}</p>

        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="lesson-title">Title</Label>
            <Input id="lesson-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lesson-kind">Day type</Label>
            <Select
              id="lesson-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as PlannerLesson["kind"])}
            >
              <option value="TEACHING">Teaching / lecture</option>
              <option value="ACTIVITY">Activity</option>
              <option value="REVISION">Revision</option>
              <option value="ASSESSMENT">Assessment</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="lesson-objectives">What to cover (one point per line)</Label>
            <textarea
              id="lesson-objectives"
              className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={objectivesText}
              onChange={(e) => setObjectivesText(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lesson-notes">Teacher script (classroom steps)</Label>
            <textarea
              id="lesson-notes"
              className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={saving}
            onClick={() =>
              onSave({
                expectedRevision: revision,
                title,
                objectives: objectivesText.split("\n").map((l) => l.trim()).filter(Boolean),
                notes,
                kind,
              })
            }
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onRegenerate({})}>
            Regenerate from pack
          </Button>
          {kind !== "ACTIVITY" && (
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onRegenerate({ regenerateActivity: true })}
            >
              Regenerate as activity
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
