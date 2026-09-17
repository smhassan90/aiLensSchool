"use client";

import { PageLoader } from "@/components/layout/page-loader";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { insightsService } from "@/services/insights.service";
import { BarChart, StackedAttendanceChart } from "@/components/charts/simple-charts";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";

type ClassOverview = {
  class: { id: string; name: string; level: number };
  enrollment: { total: number; bySection: Array<{ id: string; name: string; studentCount: number; attendanceRate: number; quizAverage: number }> };
  attendance: { rate: number; trend: Array<{ date: string; present: number; absent: number; late: number }> };
  quizzes: {
    average: number;
    items: Array<{
      id: string;
      title: string;
      subject: string;
      kind: "QUIZ" | "ASSESSMENT";
      average: number;
      highest: number;
      lowest: number;
      attempted: number;
    }>;
  };
  subjects: Array<{ name: string; average: number }>;
  fees: { billed: number; collected: number; outstanding: number; collectionRate: number };
};

export default function TeacherClassAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const [sectionId, setSectionId] = useState("");
  const query = useQuery({
    queryKey: ["class-analytics", params.id, sectionId],
    queryFn: () => insightsService.classOverview(params.id, sectionId || undefined) as Promise<ClassOverview>,
  });

  if (query.isLoading) {
    return <PageLoader variant="page" />;
  }
  if (!query.data) return <div className="p-4 sm:p-6 lg:p-8">Class not found.</div>;
  const data = query.data;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={`${data.class.name} progress`}
        description="Attendance, quizzes and subjects for this class"
        actions={
          <Link href="/teacher/classes">
            <Button variant="outline"><ArrowLeft className="h-4 w-4" />My classes</Button>
          </Link>
        }
      />

      <div className="mb-6 max-w-xs">
        <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
          <option value="">All sections</option>
          {data.enrollment.bySection.map((section) => (
            <option key={section.id} value={section.id}>{section.name}</option>
          ))}
        </Select>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardTitle className="text-sm">Students</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data.enrollment.total}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Attendance</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data.attendance.rate}%</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Quiz & assessment average</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data.quizzes.average}%</CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Attendance trend</CardTitle></CardHeader>
          <CardContent>
            <StackedAttendanceChart items={data.attendance.trend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Subject averages</CardTitle></CardHeader>
          <CardContent>
            <BarChart items={data.subjects.map((s) => ({ label: s.name, value: s.average }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Quizzes & assessments</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.quizzes.items.map((quiz) => (
              <div key={quiz.id} className="rounded-md border px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{quiz.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    quiz.kind === "ASSESSMENT"
                      ? "bg-amber-100 text-amber-900"
                      : "bg-sky-100 text-sky-900"
                  }`}>
                    {quiz.kind === "ASSESSMENT" ? "Manual assessment" : "Quiz (auto-scored)"}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap justify-between gap-2 text-muted-foreground">
                  <span>Subject: {quiz.subject}</span>
                  <span>
                    {quiz.kind === "ASSESSMENT" ? "Assessment average" : "Quiz average"}: {quiz.average}% ·{" "}
                    {quiz.attempted} {quiz.kind === "ASSESSMENT" ? "students scored" : "attempted"}
                  </span>
                </div>
              </div>
            ))}
            {!data.quizzes.items.length && <p className="text-muted-foreground">No quizzes yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
