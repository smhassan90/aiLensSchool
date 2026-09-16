"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PageLoader } from "@/components/layout/page-loader";
import { academicsService } from "@/services/academics.service";
import { useToast } from "@/providers/toast-provider";
import { formatDate } from "@/lib/utils";

type RowState = {
  sectionId: string;
  subjectId: string;
  className: string;
  subjectName: string;
  defaultTeacherName: string;
  enabled: boolean;
  maxMarks: number;
  submissionDueAt: string;
};

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
  const [rows, setRows] = useState<RowState[]>([]);

  const data = useQuery({
    queryKey: ["exam-paper-assignments", examConfigId],
    queryFn: () => academicsService.listExamPaperAssignments(examConfigId),
    enabled: Boolean(examConfigId),
  });

  const defaultDue = data.data?.defaultDueAt
    ? data.data.defaultDueAt.slice(0, 10)
    : "";

  useEffect(() => {
    if (!data.data?.rows) return;
    setRows(
      data.data.rows.map((row) => ({
        sectionId: row.sectionId,
        subjectId: row.subjectId,
        className: row.className,
        subjectName: row.subjectName,
        defaultTeacherName: row.defaultTeacherName,
        enabled: Boolean(row.assignment),
        maxMarks: row.assignment?.maxMarks ?? defaultMaxMarks,
        submissionDueAt: row.assignment?.submissionDueAt.slice(0, 10) ?? defaultDue,
      })),
    );
  }, [data.data, defaultMaxMarks, defaultDue]);

  const assignedCount = useMemo(() => rows.filter((row) => row.enabled).length, [rows]);

  const save = useMutation({
    mutationFn: (release: boolean) =>
      academicsService.saveExamPaperAssignments({
        examConfigId,
        release,
        rows: rows.map((row) => ({
          sectionId: row.sectionId,
          subjectId: row.subjectId,
          maxMarks: row.maxMarks,
          submissionDueAt: row.submissionDueAt,
          enabled: row.enabled,
        })),
      }),
    onSuccess: (_, release) => {
      toast({
        title: release ? "Assignments released to teachers" : "Assignments saved",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["exam-paper-assignments", examConfigId] });
      queryClient.invalidateQueries({ queryKey: ["school-exam-paper-submissions"] });
    },
    onError: (err: Error) => toast({ title: "Could not save", description: err.message, variant: "error" }),
  });

  if (!examConfigId) {
    return (
      <p className="text-sm text-muted-foreground">Save exam papers first, then assign them to classes.</p>
    );
  }

  if (data.isLoading) return <PageLoader variant="panel" task="exams" />;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-foreground">Assign {examName}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Set total marks and submission due date per class and subject. Teachers only see assignments after you release them.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            setRows((prev) =>
              prev.map((row) => ({
                ...row,
                enabled: true,
                maxMarks: defaultMaxMarks,
                submissionDueAt: row.submissionDueAt || defaultDue,
              })),
            )
          }
        >
          Select all
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setRows((prev) => prev.map((row) => ({ ...row, enabled: false })))}>
          Clear all
        </Button>
      </div>

      <div className="max-h-[28rem] overflow-y-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Assign</th>
              <th className="px-3 py-2">Class</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Teacher</th>
              <th className="px-3 py-2">Marks</th>
              <th className="px-3 py-2">Submit by</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={`${row.sectionId}:${row.subjectId}`} className={row.enabled ? "" : "opacity-60"}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((item) =>
                          item.sectionId === row.sectionId && item.subjectId === row.subjectId
                            ? { ...item, enabled: e.target.checked }
                            : item,
                        ),
                      )
                    }
                  />
                </td>
                <td className="px-3 py-2 font-medium">{row.className}</td>
                <td className="px-3 py-2">{row.subjectName}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.defaultTeacherName || "—"}</td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    min={1}
                    className="h-8 w-20"
                    value={row.maxMarks}
                    disabled={!row.enabled}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((item) =>
                          item.sectionId === row.sectionId && item.subjectId === row.subjectId
                            ? { ...item, maxMarks: Math.max(1, Number(e.target.value) || 1) }
                            : item,
                        ),
                      )
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="date"
                    className="h-8"
                    value={row.submissionDueAt}
                    disabled={!row.enabled}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((item) =>
                          item.sectionId === row.sectionId && item.subjectId === row.subjectId
                            ? { ...item, submissionDueAt: e.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-muted-foreground">
        {assignedCount} of {rows.length} class-subjects selected
        {defaultDue ? ` · Suggested due date ${formatDate(defaultDue)}` : ""}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={save.isPending || !assignedCount} onClick={() => save.mutate(false)}>
          Save draft
        </Button>
        <Button type="button" disabled={save.isPending || !assignedCount} onClick={() => save.mutate(true)}>
          {save.isPending ? "Saving…" : "Release to teachers"}
        </Button>
      </div>
    </div>
  );
}
