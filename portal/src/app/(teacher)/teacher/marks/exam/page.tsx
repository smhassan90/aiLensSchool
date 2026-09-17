"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Save } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { academicsService } from "@/services/academics.service";
import { teachersService } from "@/services/teachers.service";
import { useToast } from "@/providers/toast-provider";
import { formatDate, formatMarks } from "@/lib/utils";

export default function TeacherExamScoresPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [classKey, setClassKey] = useState(searchParams.get("class") ?? "");
  const [examConfigId, setExamConfigId] = useState(searchParams.get("exam") ?? "");
  const [scores, setScores] = useState<Record<string, string>>({});
  const [scoreError, setScoreError] = useState("");

  const classes = useQuery({
    queryKey: ["teacher-classes"],
    queryFn: () => teachersService.myClasses(),
  });
  const selected = classes.data?.find((cls) => `${cls.sectionId}:${cls.subjectId}` === classKey);

  const examConfigs = useQuery({
    queryKey: ["exam-configs", selected?.academicYearId],
    queryFn: () => academicsService.listExamConfigs(selected?.academicYearId),
    enabled: Boolean(selected?.academicYearId),
  });

  const sheet = useQuery({
    queryKey: ["exam-score-sheet", examConfigId, selected?.sectionId, selected?.subjectId],
    queryFn: () =>
      academicsService.getExamScoreSheet({
        examConfigId,
        sectionId: selected!.sectionId,
        subjectId: selected!.subjectId,
      }),
    enabled: Boolean(examConfigId && selected?.sectionId && selected?.subjectId),
  });

  useEffect(() => {
    if (!sheet.data) return;
    const next: Record<string, string> = {};
    for (const row of sheet.data.students) {
      next[row.studentId] = row.marks != null ? String(row.marks) : "";
    }
    setScores(next);
  }, [sheet.data]);

  const save = useMutation({
    mutationFn: () => {
      if (!selected || !examConfigId) throw new Error("Choose class and exam");
      const payload = Object.entries(scores)
        .filter(([, value]) => value.trim() !== "")
        .map(([studentId, value]) => ({ studentId, marks: Number(value) }));
      if (!payload.length) throw new Error("Enter at least one student's marks");
      const invalid = payload.find(
        (row) => !Number.isFinite(row.marks) || row.marks < 0 || row.marks > maxMarks,
      );
      if (invalid) {
        throw new Error(`Marks obtained must be between 0 and ${formatMarks(maxMarks)}.`);
      }
      return academicsService.saveExamScores({
        examConfigId,
        sectionId: selected.sectionId,
        subjectId: selected.subjectId,
        scores: payload,
      });
    },
    onSuccess: (res) => {
      toast({ title: `Saved marks for ${res.saved} students`, variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["exam-score-sheet"] });
    },
    onError: (err: Error) => toast({ title: "Could not save", description: err.message, variant: "error" }),
  });

  const maxMarks = sheet.data?.exam.maxMarks ?? 0;
  const filledCount = Object.values(scores).filter((v) => v.trim() !== "").length;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Enter exam scores"
        description="Enter marks for every student in one grid. Save when you are done."
        actions={
          <Link href="/teacher/marks">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Class & subject</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={classKey}
            onChange={(e) => {
              setClassKey(e.target.value);
              setExamConfigId("");
            }}
          >
            <option value="">Select class</option>
            {(classes.data ?? []).map((cls) => (
              <option key={`${cls.sectionId}:${cls.subjectId}`} value={`${cls.sectionId}:${cls.subjectId}`}>
                {cls.gradeName} {cls.sectionName} · {cls.subjectName}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Exam</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={examConfigId}
            onChange={(e) => setExamConfigId(e.target.value)}
            disabled={!selected}
          >
            <option value="">Select exam</option>
            {(examConfigs.data ?? []).map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.name} (out of {exam.maxMarks})
              </option>
            ))}
          </select>
        </div>
      </div>

      {sheet.isLoading && examConfigId ? <PageLoader variant="panel" task="exams" /> : null}

      {sheet.data?.scoresSubmitted ? (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-950">
          <div>
            <p className="font-medium">Exam scores submitted</p>
            <p className="mt-1 text-sm">
              This score sheet is locked. Ask the school admin to reopen score entry if corrections are needed.
            </p>
          </div>
        </div>
      ) : null}

      {sheet.data && !sheet.data.canEnterScores && !sheet.data.scoresSubmitted ? (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Score entry deadline has passed</p>
            <p className="mt-1 text-sm">
              {sheet.data.scoreEntryDueAt
                ? `The due date was ${formatDate(sheet.data.scoreEntryDueAt)}. Please contact the school admin.`
                : "Please contact the school admin."}
            </p>
          </div>
        </div>
      ) : null}

      {sheet.data?.scoresSubmitted && sheet.data.canEnterScores ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          The school admin reopened this submitted score sheet. You may correct the marks until the extension expires.
        </div>
      ) : null}

      {sheet.data?.canEnterScores ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{sheet.data.exam.name}</p>
              <p className="text-muted-foreground">
                {sheet.data.className} · {sheet.data.subjectName} · out of {formatMarks(maxMarks)}
                {sheet.data.scoreEntryDueAt ? ` · enter by ${formatDate(sheet.data.scoreEntryDueAt)}` : ""}
              </p>
            </div>
            <p className="text-muted-foreground">{filledCount} / {sheet.data.students.length} entered</p>
          </div>

          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="grid grid-cols-[2.5rem_6rem_minmax(8rem,1fr)_7rem] gap-3 border-b bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Sr. No.</span>
              <span>Roll number</span>
              <span>Name of student</span>
              <span>Marks obtained</span>
            </div>
            <div className="divide-y">
              {sheet.data.students.map((student, index) => (
                <div
                  key={student.studentId}
                  className="grid grid-cols-[2.5rem_6rem_minmax(8rem,1fr)_7rem] items-center gap-3 px-4 py-3"
                >
                  <span className="text-sm text-muted-foreground">{index + 1}</span>
                  <p className="text-sm text-muted-foreground">{student.studentCode}</p>
                  <div>
                    <p className="font-medium">{student.firstName} {student.lastName}</p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={maxMarks}
                    step={0.1}
                    inputMode="decimal"
                    value={scores[student.studentId] ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      setScores((prev) => ({ ...prev, [student.studentId]: value }));
                      if (value.trim() === "") {
                        setScoreError("");
                      } else {
                        const marks = Number(value);
                        setScoreError(
                          !Number.isFinite(marks) || marks < 0 || marks > maxMarks
                            ? `Marks obtained must be between 0 and ${formatMarks(maxMarks)}.`
                            : "",
                        );
                      }
                    }}
                    className="h-9"
                    aria-invalid={Boolean(scoreError)}
                    placeholder="—"
                  />
                </div>
              ))}
            </div>
          </div>

          {scoreError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">{scoreError}</p>
          ) : null}

          <div className="mt-6 flex justify-end">
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || filledCount !== sheet.data.students.length}
            >
              <Save className="h-4 w-4" />
              {save.isPending ? "Saving…" : "Save all marks"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
