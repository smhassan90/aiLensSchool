"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageLoader } from "@/components/layout/page-loader";
import { academicsService } from "@/services/academics.service";
import { useToast } from "@/providers/toast-provider";
import { formatDate } from "@/lib/utils";
import { buildQuestionSpecForMarks } from "@/lib/exam-paper-question-spec";

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

  const data = useQuery({
    queryKey: ["exam-paper-assignments", examConfigId],
    queryFn: () => academicsService.listExamPaperAssignments(examConfigId),
    enabled: Boolean(examConfigId),
  });

  const defaultDue = data.data?.defaultDueAt ? data.data.defaultDueAt.slice(0, 10) : "";
  const totalAssignments = data.data?.targetCount ?? data.data?.rows.length ?? 0;

  useEffect(() => {
    if (defaultDue && !dueDate) {
      setDueDate(defaultDue);
    }
  }, [defaultDue, dueDate]);

  const apply = useMutation({
    mutationFn: (release: boolean) => {
      if (!dueDate) throw new Error("Choose a paper submission due date");
      return academicsService.saveExamPaperAssignments({
        examConfigId,
        release,
        applyToAll: true,
        maxMarks: defaultMaxMarks,
        submissionDueAt: dueDate,
        questionSpec: buildQuestionSpecForMarks(defaultMaxMarks),
      });
    },
    onSuccess: (_, release) => {
      toast({
        title: release ? "Exam applied to all classes and subjects" : "Assignment saved",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["exam-paper-assignments", examConfigId] });
      queryClient.invalidateQueries({ queryKey: ["school-exam-paper-submissions"] });
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

  if (data.isLoading) return <PageLoader variant="panel" task="exams" />;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-muted/20 px-4 py-4">
        <p className="text-sm text-muted-foreground">
          Apply <span className="font-medium text-foreground">{examName}</span> ({defaultMaxMarks} marks) to{" "}
          <span className="font-medium text-foreground">all classes and all subjects</span>. Teachers are matched
          automatically from class assignments or subject expertise.
        </p>
        {totalAssignments ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {totalAssignments} class-subject assignment{totalAssignments === 1 ? "" : "s"} will be created.
          </p>
        ) : (
          <p className="mt-2 text-sm text-amber-800">
            No classes or subjects found. Add them under Setup first.
          </p>
        )}
      </div>

      <div className="max-w-sm space-y-2">
        <Label htmlFor="dueDate" className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          Paper submission due date
        </Label>
        <p className="text-xs text-muted-foreground">When teachers must submit their completed exam papers.</p>
        <Input
          id="dueDate"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
        {defaultDue ? (
          <p className="text-xs text-muted-foreground">Suggested: {formatDate(defaultDue)}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={apply.isPending || !dueDate || !totalAssignments}
          onClick={() => apply.mutate(false)}
        >
          Save draft
        </Button>
        <Button
          type="button"
          disabled={apply.isPending || !dueDate || !totalAssignments}
          onClick={() => apply.mutate(true)}
        >
          {apply.isPending ? "Applying…" : "Apply to all classes and subjects"}
        </Button>
      </div>
    </div>
  );
}
