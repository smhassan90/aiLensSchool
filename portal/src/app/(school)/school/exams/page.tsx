"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { academicsService } from "@/services/academics.service";
import { useToast } from "@/providers/toast-provider";
import { useAuth } from "@/providers/auth-provider";
import { ExamPapersEditor } from "@/components/exams/exam-papers-editor";
import { ExamPaperAssignmentsEditor } from "@/components/exams/exam-paper-assignments-editor";
import { createDraftPaper, defaultExamDrafts, toExamPayload, type DraftExamPaper } from "@/lib/exam-patterns";

export default function ExamsPage() {
  const { toast } = useToast();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [yearId, setYearId] = useState("");
  const [papers, setPapers] = useState<DraftExamPaper[]>(defaultExamDrafts);
  const [submissionDaysBefore, setSubmissionDaysBefore] = useState(5);
  const [assignExamId, setAssignExamId] = useState("");
  const years = useQuery({ queryKey: ["years"], queryFn: () => academicsService.listYears({ limit: 20 }) });
  const targets = useQuery({ queryKey: ["quiz-targets"], queryFn: () => academicsService.listQuizTargets() });
  const [weeklyQuizTarget, setWeeklyQuizTarget] = useState(2);
  const configs = useQuery({
    queryKey: ["exam-configs", yearId],
    queryFn: () => academicsService.listExamConfigs(yearId),
    enabled: Boolean(yearId),
  });
  const examSettings = useQuery({
    queryKey: ["exam-settings"],
    queryFn: () => academicsService.getExamSettings(),
  });

  const loadedYear = useRef("");

  useEffect(() => {
    const current = years.data?.items.find((year) => year.isCurrent) ?? years.data?.items[0];
    if (current && !yearId) setYearId(current.id);
  }, [years.data, yearId]);

  useEffect(() => {
    if (examSettings.data?.examSubmissionDaysBefore) {
      setSubmissionDaysBefore(examSettings.data.examSubmissionDaysBefore);
    }
  }, [examSettings.data?.examSubmissionDaysBefore]);

  useEffect(() => {
    const values = (targets.data ?? []).map((row) => row.minQuizzes);
    if (!values.length) return;
    const first = values[0];
    if (values.every((value) => value === first)) {
      setWeeklyQuizTarget(first);
    }
  }, [targets.data]);

  useEffect(() => {
    if (!yearId || configs.isFetching) return;
    if (loadedYear.current === yearId) return;
    loadedYear.current = yearId;
    if (configs.data?.length) {
                    setPapers(configs.data.map((exam) => createDraftPaper(exam.name, exam.maxMarks, exam)));
      return;
    }
    setPapers(defaultExamDrafts());
  }, [yearId, configs.data, configs.isFetching]);

  const save = useMutation({
    mutationFn: () => {
      const exams = toExamPayload(papers);
      if (!yearId) throw new Error("Choose a year");
      if (!exams.length) throw new Error("Add at least one exam paper");
      return academicsService.saveExamPattern({
        academicYearId: yearId,
        pattern: "CUSTOM",
        examSubmissionDaysBefore: submissionDaysBefore,
        exams,
      });
    },
    onSuccess: () => {
      toast({ title: "Exam papers saved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["exam-configs"] });
    },
    onError: (err: Error) => toast({ title: "Could not save", description: err.message, variant: "error" }),
  });

  const saveTarget = useMutation({
    mutationFn: () =>
      academicsService.saveQuizTarget({
        minQuizzes: weeklyQuizTarget,
      }),
    onSuccess: () => {
      toast({
        title: "Weekly quiz target saved",
        description: `${weeklyQuizTarget} quiz${weeklyQuizTarget === 1 ? "" : "zes"} per week for all classes.`,
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["quiz-targets"] });
    },
    onError: (err: Error) => toast({ title: "Could not save", description: err.message, variant: "error" }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Exams & quiz targets"
        description="Each school sets its own papers, marks, and exam dates. Change this any time."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Exam papers</CardTitle></CardHeader>
          <CardContent>
            <form
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                save.mutate();
              }}
              className="space-y-4"
            >
              <select
                required
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={yearId}
                onChange={(e) => {
                  loadedYear.current = "";
                  setYearId(e.target.value);
                }}
              >
                <option value="">Choose year</option>
                {(years.data?.items ?? []).map((year) => (
                  <option key={year.id} value={year.id}>{year.name}</option>
                ))}
              </select>
              <ExamPapersEditor papers={papers} onChange={setPapers} />
              <div className="space-y-2">
                <Label htmlFor="submissionDaysBefore">Paper submission deadline</Label>
                <p className="text-xs text-muted-foreground">
                  Teachers must submit exam papers this many days before the tentative exam date.
                </p>
                <Input
                  id="submissionDaysBefore"
                  type="number"
                  min={1}
                  max={60}
                  value={submissionDaysBefore}
                  onChange={(e) => setSubmissionDaysBefore(Math.max(1, Number(e.target.value) || 5))}
                />
              </div>
              <Button type="submit" disabled={save.isPending || !yearId}>
                {save.isPending ? "Saving…" : "Save papers"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="space-y-1">
            <CardTitle>Apply exam</CardTitle>
            <p className="text-sm font-normal text-muted-foreground">
              Choose an exam and set the due date for exam paper submission. It applies to all classes and all subjects.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="assignExamId">Exam to apply</Label>
              <select
                id="assignExamId"
                className="h-10 w-full max-w-md rounded-md border bg-background px-3 text-sm"
                value={assignExamId}
                onChange={(e) => setAssignExamId(e.target.value)}
              >
                <option value="">Choose an exam</option>
                {(configs.data ?? []).map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.name} · {exam.maxMarks} marks
                    {exam.startDate ? ` · ${exam.startDate.slice(0, 10)}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <ExamPaperAssignmentsEditor
              examConfigId={assignExamId}
              examName={(configs.data ?? []).find((exam) => exam.id === assignExamId)?.name ?? "Exam"}
              defaultMaxMarks={(configs.data ?? []).find((exam) => exam.id === assignExamId)?.maxMarks ?? 50}
            />
          </CardContent>
        </Card>

        {can("SET_QUIZ_TARGETS") && (
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle>Weekly quiz target</CardTitle>
              <p className="text-sm font-normal text-muted-foreground">
                Set how many quizzes teachers should publish each week.
              </p>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e: FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  saveTarget.mutate();
                }}
                className="space-y-3"
              >
                <div className="space-y-2">
                  <Label htmlFor="minQuizzes">Quizzes per week</Label>
                  <p className="text-xs text-muted-foreground">Applies to all classes.</p>
                  <Input
                    id="minQuizzes"
                    type="number"
                    min={1}
                    max={20}
                    value={weeklyQuizTarget}
                    onChange={(e) => setWeeklyQuizTarget(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
                <Button type="submit" disabled={saveTarget.isPending}>
                  {saveTarget.isPending ? "Saving…" : "Save target"}
                </Button>
              </form>
              {(targets.data ?? []).length ? (
                <p className="mt-4 rounded-md border px-3 py-2 text-sm">
                  All classes: {weeklyQuizTarget} {weeklyQuizTarget === 1 ? "quiz" : "quizzes"}/week
                </p>
              ) : null}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
