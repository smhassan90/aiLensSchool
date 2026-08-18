"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { dashboardService } from "@/services/dashboard.service";
import { PageLoader } from "@/components/layout/page-loader";
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
        <PageHeader title="Your day" />
        <PageLoader variant="page" phrases={["Checking lessons and attendance"]} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="What to do today"
        description="Missing work is listed first. Tap a class to add a lesson or attendance."
        actions={
          <Button onClick={() => suggest.mutate()} disabled={suggest.isPending}>
            {suggest.isPending ? "Thinking…" : "AI hint for me"}
          </Button>
        }
      />

      <div className="mb-6 space-y-2">
        {(data?.nextActions ?? []).map((action) => {
          const href = action.toLowerCase().includes("lesson")
            ? "/teacher/lessons/new"
            : action.toLowerCase().includes("attendance")
              ? "/teacher/attendance"
              : action.toLowerCase().includes("quiz")
                ? "/teacher/quizzes"
                : "/teacher/marks";
          return (
            <Link key={action} href={href} className="block rounded-lg border bg-card px-4 py-3 text-sm font-medium hover:bg-muted">
              {action}
            </Link>
          );
        })}
      </div>

      {coach && (
        <Card className="mb-6">
          <CardHeader><CardTitle>{coach.headline}</CardTitle></CardHeader>
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
      )}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/teacher/lessons/new"><Card><CardHeader><CardTitle className="text-sm">Missing lessons</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data?.missingLessonDays ?? 0}</CardContent></Card></Link>
        <Link href="/teacher/attendance"><Card><CardHeader><CardTitle className="text-sm">Attendance gaps</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data?.missingAttendanceSlots ?? 0}</CardContent></Card></Link>
        <Link href="/teacher/quizzes"><Card><CardHeader><CardTitle className="text-sm">Quizzes</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data?.quizCount ?? 0}{data?.quizTarget ? ` / ${data.quizTarget}` : ""}</CardContent></Card></Link>
        <Link href="/teacher/homework"><Card><CardHeader><CardTitle className="text-sm">Homework</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data?.homeworkCount ?? 0}</CardContent></Card></Link>
      </div>

      {(data?.watchQuizzes?.length ?? 0) > 0 && (
        <Card className="mt-6 border-amber-200">
          <CardHeader><CardTitle>Keep an eye on these quizzes</CardTitle></CardHeader>
          <CardContent className="text-sm">{data?.watchQuizzes.join(" · ")}</CardContent>
        </Card>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>My classes</CardTitle></CardHeader>
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
          <CardHeader><CardTitle>Latest scores</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(data?.latestResults ?? []).map((row) => (
              <p key={row.id}>
                {row.student ? `${row.student.firstName} ${row.student.lastName}` : "Student"} · {row.quiz?.title} · {Number(row.percentage)}%
              </p>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
