"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
  });
  const suggest = useMutation({
    mutationFn: () => dashboardService.teacherCoach(),
    onSuccess: setCoach,
  });
  const data = dashboard.data;

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
          <Button onClick={() => suggest.mutate()} disabled={suggest.isPending}>
            {suggest.isPending ? "Thinking…" : "AI hint"}
          </Button>
        }
      />

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
            {(data?.classes ?? []).map((cls) => (
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
