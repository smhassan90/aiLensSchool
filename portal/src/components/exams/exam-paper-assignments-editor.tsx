"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { academicsService } from "@/services/academics.service";
import { useToast } from "@/providers/toast-provider";

export function ExamPaperAssignmentsEditor({
  examConfigId,
  examName,
  defaultMaxMarks,
}: {
  examConfigId: string;
  examName: string;
  defaultMaxMarks: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dueDate, setDueDate] = useState("");
  const [scoreDueDate, setScoreDueDate] = useState("");

  const apply = useMutation({
    mutationFn: (release: boolean) => {
      if (!dueDate) throw new Error("Choose a paper submission due date");
      if (!scoreDueDate) throw new Error("Choose a score entry due date");
      return academicsService.saveExamPaperAssignments({
        examConfigId,
        release,
        applyToAll: true,
        maxMarks: defaultMaxMarks,
        submissionDueAt: dueDate,
        scoreEntryDueAt: scoreDueDate,
      });
    },
    onSuccess: (res, release) => {
      toast({
        title: release ? "Exam released school-wide" : "Deadlines saved",
        description: release
          ? `${res.saved} class-subject assignment${res.saved === 1 ? "" : "s"} created. Teachers will see this on their dashboard.`
          : "Apply when you are ready for teachers to start.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["exam-paper-assignments", examConfigId] });
      queryClient.invalidateQueries({ queryKey: ["school-exam-paper-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["exam-configs"] });
      queryClient.invalidateQueries({ queryKey: ["my-exam-paper-assignments"] });
    },
    onError: (err: Error) => toast({ title: "Could not apply", description: err.message, variant: "error" }),
  });

  if (!examConfigId) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        Save your exam papers first, then choose one above to apply it.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-muted/20 px-4 py-4">
        <p className="text-sm text-muted-foreground">
          Release <span className="font-medium text-foreground">{examName}</span> ({defaultMaxMarks} marks) for{" "}
          <span className="font-medium text-foreground">the whole school</span>. Teachers will automatically see it
          for their classes when they log in — no per-class setup needed here.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="dueDate" className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Paper submission due
          </Label>
          <p className="text-xs text-muted-foreground">Last day teachers can submit exam papers.</p>
          <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="scoreDueDate" className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Score entry due
          </Label>
          <p className="text-xs text-muted-foreground">Last day teachers can enter student marks.</p>
          <Input
            id="scoreDueDate"
            type="date"
            value={scoreDueDate}
            onChange={(e) => setScoreDueDate(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={apply.isPending || !dueDate || !scoreDueDate}
          onClick={() => apply.mutate(false)}
        >
          Save deadlines
        </Button>
        <Button
          type="button"
          disabled={apply.isPending || !dueDate || !scoreDueDate}
          onClick={() => apply.mutate(true)}
        >
          {apply.isPending ? "Applying…" : "Apply to all classes & subjects"}
        </Button>
      </div>
    </div>
  );
}
