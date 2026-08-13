"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { teachersService } from "@/services/teachers.service";
import { quizzesService } from "@/services/quizzes.service";
import { homeworkService } from "@/services/homework.service";
import { resultsService } from "@/services/results.service";

export default function TeacherDashboardPage() {
  const classes = useQuery({ queryKey: ["teacher-classes"], queryFn: () => teachersService.myClasses() });
  const quizzes = useQuery({ queryKey: ["teacher-quizzes"], queryFn: () => quizzesService.list({ limit: 20 }) });
  const homework = useQuery({ queryKey: ["homework"], queryFn: () => homeworkService.list({ limit: 20 }) });
  const results = useQuery({ queryKey: ["results"], queryFn: () => resultsService.list({ limit: 10 }) });

  return (
    <div className="p-8">
      <PageHeader title="Dashboard" description="Your classes, quizzes and recent scores" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardTitle className="text-sm">Classes</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{classes.data?.length ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Quizzes</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{quizzes.data?.total ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Homework</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{homework.data?.total ?? "—"}</CardContent></Card>
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>My classes</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(classes.data ?? []).map((cls) => (
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
            {(results.data?.items ?? []).slice(0, 8).map((row) => (
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
