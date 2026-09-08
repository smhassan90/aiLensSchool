"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { academicsService } from "@/services/academics.service";
import { useToast } from "@/providers/toast-provider";
import { useAuth } from "@/providers/auth-provider";
import { ExamPapersEditor } from "@/components/exams/exam-papers-editor";
import { createDraftPaper, defaultExamDrafts, toExamPayload, type DraftExamPaper } from "@/lib/exam-patterns";

export default function ExamsPage() {
  const { toast } = useToast();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [yearId, setYearId] = useState("");
  const [papers, setPapers] = useState<DraftExamPaper[]>(defaultExamDrafts);
  const years = useQuery({ queryKey: ["years"], queryFn: () => academicsService.listYears({ limit: 20 }) });
  const grades = useQuery({ queryKey: ["grades"], queryFn: () => academicsService.listGrades({ limit: 50 }) });
  const subjects = useQuery({ queryKey: ["subjects"], queryFn: () => academicsService.listSubjects({ limit: 100 }) });
  const targets = useQuery({ queryKey: ["quiz-targets"], queryFn: () => academicsService.listQuizTargets() });
  const configs = useQuery({
    queryKey: ["exam-configs", yearId],
    queryFn: () => academicsService.listExamConfigs(yearId),
    enabled: Boolean(yearId),
  });

  const loadedYear = useRef("");

  useEffect(() => {
    const current = years.data?.items.find((year) => year.isCurrent) ?? years.data?.items[0];
    if (current && !yearId) setYearId(current.id);
  }, [years.data, yearId]);

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
      return academicsService.saveExamPattern({ academicYearId: yearId, pattern: "CUSTOM", exams });
    },
    onSuccess: () => {
      toast({ title: "Exam papers saved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["exam-configs"] });
    },
    onError: (err: Error) => toast({ title: "Could not save", description: err.message, variant: "error" }),
  });

  const saveTarget = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      return academicsService.saveQuizTarget({
        gradeId: String(data.get("gradeId")),
        subjectId: String(data.get("subjectId")),
        minQuizzes: Number(data.get("minQuizzes") || 4),
      });
    },
    onSuccess: () => {
      toast({ title: "Quiz minimum saved", variant: "success" });
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
              <Button type="submit" disabled={save.isPending || !yearId}>
                {save.isPending ? "Saving…" : "Save papers"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {can("SET_QUIZ_TARGETS") && (
          <Card>
            <CardHeader><CardTitle>Minimum quizzes</CardTitle></CardHeader>
            <CardContent>
              <form
                onSubmit={(e: FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  saveTarget.mutate(e.currentTarget);
                }}
                className="space-y-3"
              >
                <select name="gradeId" required className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="">Class</option>
                  {(grades.data?.items ?? []).map((grade) => (
                    <option key={grade.id} value={grade.id}>{grade.name}</option>
                  ))}
                </select>
                <select name="subjectId" required className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="">Subject</option>
                  {(subjects.data?.items ?? []).map((subject) => (
                    <option key={subject.id} value={subject.id}>{subject.name}</option>
                  ))}
                </select>
                <label className="text-sm">At least how many?<input name="minQuizzes" type="number" min={1} defaultValue={4} className="mt-1 h-10 w-full rounded-md border px-3" /></label>
                <Button type="submit">Save minimum</Button>
              </form>
              <div className="mt-4 space-y-2 text-sm">
                {(targets.data ?? []).map((row) => (
                  <p key={row.id} className="rounded-md border px-3 py-2">
                    {row.grade?.name} · {row.subject?.name} · {row.minQuizzes} quizzes
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
