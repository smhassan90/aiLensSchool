"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, Users } from "lucide-react";
import { PageLoader } from "@/components/layout/page-loader";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { teachersService } from "@/services/teachers.service";
import { teacherClassRosterHref } from "@/lib/teacher-class-links";

export default function TeacherClassDetailPage() {
  const params = useParams<{ sectionId: string; subjectId: string }>();

  const classesQuery = useQuery({
    queryKey: ["teacher-classes"],
    queryFn: () => teachersService.myClasses(),
  });

  const cls = useMemo(
    () =>
      (classesQuery.data ?? []).find(
        (row) => row.sectionId === params.sectionId && row.subjectId === params.subjectId,
      ),
    [classesQuery.data, params.sectionId, params.subjectId],
  );

  if (classesQuery.isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageLoader variant="page" />
      </div>
    );
  }

  if (!cls) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <p className="text-sm text-muted-foreground">This class is not assigned to you or could not be found.</p>
        <Link href="/teacher/classes" className="mt-4 inline-block">
          <Button variant="outline">Back to my classes</Button>
        </Link>
      </div>
    );
  }

  const title = `${cls.gradeName} · Section ${cls.sectionName}`;
  const rosterHref = teacherClassRosterHref(cls);
  const studentCount = cls.studentCount ?? 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={title}
        description={cls.subjectName}
        actions={
          <Link href="/teacher/classes">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              My classes
            </Button>
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {cls.isClassTeacher ? (
          <Badge variant="success">Class teacher</Badge>
        ) : (
          <Badge variant={cls.role === "ASSISTANT" ? "secondary" : "outline"}>
            {cls.role === "ASSISTANT" ? "Assistant" : "Subject teacher"}
          </Badge>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-3xl">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Students</CardTitle>
            <CardDescription>Active enrollments in this section</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={rosterHref}
              className="group inline-flex items-center gap-3 rounded-lg outline-none ring-primary transition hover:opacity-90 focus-visible:ring-2"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary group-hover:bg-primary/15">
                <Users className="h-6 w-6" />
              </span>
              <span>
                <span className="block text-3xl font-semibold tabular-nums text-primary underline-offset-4 group-hover:underline">
                  {studentCount}
                </span>
                <span className="text-sm text-muted-foreground group-hover:text-foreground">
                  View student list
                </span>
              </span>
            </Link>
          </CardContent>
        </Card>

        {cls.gradeId ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Progress</CardTitle>
              <CardDescription>Attendance, quizzes, and subject averages</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href={`/teacher/classes/${cls.gradeId}/analytics?sectionId=${cls.sectionId}`}>
                <Button variant="outline" className="w-full sm:w-auto">
                  <BarChart3 className="h-4 w-4" />
                  Open class progress
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
