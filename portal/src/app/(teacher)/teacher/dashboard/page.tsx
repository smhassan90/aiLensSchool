"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { academicsService } from "@/services/academics.service";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { dashboardService } from "@/services/dashboard.service";
import { PageLoader } from "@/components/layout/page-loader";
import { AiWait } from "@/components/layout/ai-wait";
import { TeacherPaceBoard } from "@/components/dashboard/teacher-pace";
import { cn } from "@/lib/utils";

export default function TeacherDashboardPage() {
  const [coach, setCoach] = useState<Awaited<ReturnType<typeof dashboardService.teacherCoach>> | null>(null);
  const dashboard = useQuery({
    queryKey: ["teacher-dashboard"],
    queryFn: () => dashboardService.teacher(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const examAssignments = useQuery({
    queryKey: ["my-exam-paper-assignments"],
    queryFn: () => academicsService.listMyExamPaperAssignments(),
    staleTime: 60_000,
  });
  const suggest = useMutation({
    mutationFn: () => dashboardService.teacherCoach(),
    onSuccess: setCoach,
  });
  const data = dashboard.data;
  const assignments = examAssignments.data?.assignments ?? [];
  const paperDueSoon = assignments.filter(
    (row) =>
      row.paperSubmissionOpen &&
      (row.status === "NOT_STARTED" || row.status === "DRAFT") &&
      row.submissionDueAt,
  );
  const scoreDueSoon = assignments.filter(
    (row) => row.status === "APPROVED" && row.scoreEntryOpen && row.scoreEntryDueAt,
  );
  const sortedClasses = [...new Map(
    (data?.classes ?? []).map((cls) => [`${cls.sectionId}:${cls.subjectId}`, cls] as const),
  ).values()].sort((a, b) => {
    const grade = a.gradeName.localeCompare(b.gradeName, undefined, { numeric: true, sensitivity: "base" });
    if (grade !== 0) return grade;
    const section = a.sectionName.localeCompare(b.sectionName, undefined, { numeric: true, sensitivity: "base" });
    if (section !== 0) return section;
    return a.subjectName.localeCompare(b.subjectName, undefined, { sensitivity: "base" });
  });

  if (dashboard.isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader title="Your pace" />
        <PageLoader variant="page" phrases={["Checking lectures and attendance", "Looking at quizzes", "Almost ready"]} />
      </div>
    );
  }

  const expectedLessons = data?.expectedLessonSlots ?? Math.max(data?.missingLessonDays ?? 0, 1);
  const doneLessons = data?.doneLessonSlots ?? Math.max(0, expectedLessons - (data?.missingLessonDays ?? 0));
  const expectedAttendance = data?.expectedAttendanceSlots ?? Math.max(data?.missingAttendanceSlots ?? 0, 1);
  const doneAttendance =
    data?.doneAttendanceSlots ?? Math.max(0, expectedAttendance - (data?.missingAttendanceSlots ?? 0));

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Your pace"
        actions={
          <Button type="button" onClick={() => suggest.mutate()} disabled={suggest.isPending}>
            {suggest.isPending ? "Thinking…" : "AI hint"}
          </Button>
        }
      />

      {(data?.examPaperPendingCount ?? 0) > 0 ? (
        <Link
          href="/teacher/exams"
          className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 transition-colors hover:bg-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">
              {data?.examPaperPendingCount} exam paper{(data?.examPaperPendingCount ?? 0) === 1 ? "" : "s"} still to generate and submit
            </p>
            <p className="mt-0.5 text-sm text-amber-900/80">
              Open exam papers to generate your paper with the required question mix and submit it before the due date.
            </p>
            {paperDueSoon.slice(0, 2).map((row) => (
              <p key={row.id} className="mt-1 text-sm font-medium text-amber-900">
                {row.className} · {row.subjectName} — submit by {formatDate(row.submissionDueAt)}
              </p>
            ))}
          </div>
        </Link>
      ) : null}

      {scoreDueSoon.length > 0 ? (
        <Link
          href="/teacher/marks/exam"
          className="mb-6 flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-950 transition-colors hover:bg-sky-100"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Enter exam scores before the deadline</p>
            {scoreDueSoon.slice(0, 2).map((row) => (
              <p key={row.id} className="mt-1 text-sm text-sky-900/90">
                {row.examName} · {row.className} — enter by {formatDate(row.scoreEntryDueAt!)}
              </p>
            ))}
          </div>
        </Link>
      ) : null}

      <TeacherPaceBoard
        expectedLessonSlots={expectedLessons}
        doneLessonSlots={doneLessons}
        expectedAttendanceSlots={expectedAttendance}
        doneAttendanceSlots={doneAttendance}
        lessonHeat={data?.lessonHeat ?? []}
        attendanceHeat={data?.attendanceHeat ?? []}
        lessonByClass={data?.lessonByClass ?? []}
        attendanceByClass={data?.attendanceByClass ?? []}
        quizCount={data?.quizCount ?? 0}
        quizTarget={data?.quizTarget ?? null}
      />

      {suggest.isError ? (
        <p className="mt-4 text-sm text-destructive">
          {suggest.error instanceof Error ? suggest.error.message : "Could not get an AI hint. Try again."}
        </p>
      ) : null}

      {suggest.isPending ? (
        <div className="mt-6">
          <AiWait kind="coach" />
        </div>
      ) : coach ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{coach.headline}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {coach.cards.map((card) => (
              <div
                key={card.title}
                className={cn(
                  "rounded-md border p-3",
                  card.tone === "act" && "border-rose-200",
                  card.tone === "watch" && "border-amber-200",
                  card.tone === "good" && "border-emerald-200",
                )}
              >
                <p className="font-medium">{card.title}</p>
                <p className="text-sm text-muted-foreground">{card.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {(data?.watchQuizzes?.length ?? 0) > 0 && (
        <Card className="mt-6 border-amber-200">
          <CardHeader>
            <CardTitle>Low quiz scores</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {data?.watchQuizzes.map((title) => (
              <span key={title} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
                {title}
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>My classes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {sortedClasses.map((cls) => (
              <Link
                key={`${cls.sectionId}-${cls.subjectId}`}
                href="/teacher/lessons/new"
                className="block rounded-md border px-3 py-2 hover:bg-muted"
              >
                {cls.gradeName} {cls.sectionName} · {cls.subjectName}
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Latest scores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data?.latestResults ?? []).map((row) => (
              <div key={row.id} className="space-y-1">
                <div className="flex justify-between gap-2 text-xs">
                  <span className="truncate">
                    {row.student ? `${row.student.firstName} ${row.student.lastName}` : "Student"}
                  </span>
                  <span className="tabular-nums font-medium">{Number(row.percentage)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      Number(row.percentage) >= 70 ? "bg-emerald-500" : Number(row.percentage) >= 50 ? "bg-amber-400" : "bg-rose-500",
                    )}
                    style={{ width: `${Math.min(100, Number(row.percentage))}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
