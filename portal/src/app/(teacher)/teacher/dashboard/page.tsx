"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dashboardService } from "@/services/dashboard.service";
import { PageLoader } from "@/components/layout/page-loader";

export default function TeacherDashboardPage() {
  const dashboard = useQuery({
    queryKey: ["teacher-dashboard"],
    queryFn: () => dashboardService.teacher(),
  });
  const data = dashboard.data;

  if (dashboard.isLoading) {
    return (
      <div className="p-8">
        <PageHeader title="Dashboard" description="Your classes, quizzes and recent scores" />
        <PageLoader
          variant="page"
          phrases={["Opening your classes", "Collecting quizzes and scores", "Almost ready"]}
        />
      </div>
    );
  }

  return (
    <div className="p-8">
      <PageHeader title="Dashboard" description="Your classes, quizzes and recent scores" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardTitle className="text-sm">Classes</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data?.classCount ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Quizzes</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data?.quizCount ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Homework</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data?.homeworkCount ?? "—"}</CardContent></Card>
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>My classes</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(data?.classes ?? []).map((cls) => (
              <Link
                key={`${cls.sectionId}-${cls.subjectId}`}
                href={cls.gradeId ? `/teacher/classes/${cls.gradeId}/analytics` : "/teacher/classes"}
                className="block hover:underline"
              >
                {cls.gradeName} {cls.sectionName} · {cls.subjectName}
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Latest results</CardTitle></CardHeader>
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
