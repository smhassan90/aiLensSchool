"use client";

import { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { academicsService } from "@/services/academics.service";
import { useToast } from "@/providers/toast-provider";
import { useAuth } from "@/providers/auth-provider";

export default function ExamsPage() {
  const { toast } = useToast();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const years = useQuery({ queryKey: ["years"], queryFn: () => academicsService.listYears({ limit: 20 }) });
  const grades = useQuery({ queryKey: ["grades"], queryFn: () => academicsService.listGrades({ limit: 50 }) });
  const subjects = useQuery({ queryKey: ["subjects"], queryFn: () => academicsService.listSubjects({ limit: 100 }) });
  const targets = useQuery({ queryKey: ["quiz-targets"], queryFn: () => academicsService.listQuizTargets() });

  const save = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const data = new FormData(form);
      const pattern = String(data.get("pattern"));
      const academicYearId = String(data.get("academicYearId"));
      const exams =
        pattern === "THREE_TERMS"
          ? [
              { name: "First term", maxMarks: Number(data.get("marks") || 100), sequence: 1 },
              { name: "Second term", maxMarks: Number(data.get("marks") || 100), sequence: 2 },
              { name: "Third term", maxMarks: Number(data.get("marks") || 100), sequence: 3 },
            ]
          : [
              { name: "Mid term", maxMarks: Number(data.get("mid") || 50), sequence: 1 },
              { name: "Final term", maxMarks: Number(data.get("final") || 100), sequence: 2 },
            ];
      return academicsService.saveExamPattern({ academicYearId, pattern, exams });
    },
    onSuccess: () => {
      toast({ title: "Exam pattern saved", variant: "success" });
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
      <PageHeader title="Exams & quiz targets" description="Pick mid + final or three terms. Set how many quizzes each subject needs." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Exam pattern</CardTitle></CardHeader>
          <CardContent>
            <form
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                save.mutate(e.currentTarget);
              }}
              className="space-y-4"
            >
              <select name="academicYearId" required className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="">Choose year</option>
                {(years.data?.items ?? []).map((year) => (
                  <option key={year.id} value={year.id}>{year.name}</option>
                ))}
              </select>
              <select name="pattern" className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="MID_FINAL">Mid term and Final</option>
                <option value="THREE_TERMS">First, second, third term</option>
              </select>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">Mid marks<input name="mid" type="number" defaultValue={50} className="mt-1 h-10 w-full rounded-md border px-3" /></label>
                <label className="text-sm">Final marks<input name="final" type="number" defaultValue={100} className="mt-1 h-10 w-full rounded-md border px-3" /></label>
              </div>
              <label className="text-sm">If three terms, each paper<input name="marks" type="number" defaultValue={100} className="mt-1 h-10 w-full rounded-md border px-3" /></label>
              <Button type="submit">Save pattern</Button>
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
