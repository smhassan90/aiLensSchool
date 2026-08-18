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
  quizzes: { average: number; items: Array<{ id: string; title: string; subject: string; average: number; highest: number; lowest: number; attempted: number }> };
  subjects: Array<{ name: string; average: number }>;
  fees: { billed: number; collected: number; outstanding: number; collectionRate: number };
};

export default function ClassAnalyticsPage() {
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
        description="Attendance, quizzes, subjects and fees for this class in one view"
        actions={
          <Link href={`/school/academics/grades/${params.id}`}>
            <Button variant="outline"><ArrowLeft className="h-4 w-4" />Class setup</Button>
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

      <div className="mb-6 grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-sm">Students</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data.enrollment.total}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Attendance</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data.attendance.rate}%</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Quiz average</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data.quizzes.average}%</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Fee collection</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data.fees.collectionRate}%</CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Attendance trend</CardTitle></CardHeader>
          <CardContent>
            <StackedAttendanceChart items={data.attendance.trend} />
            <p className="mt-2 text-xs text-muted-foreground">Green present · Amber late · Rose absent</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Subject averages</CardTitle></CardHeader>
          <CardContent>
            <BarChart items={data.subjects.map((s) => ({ label: s.name, value: s.average }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Sections</CardTitle></CardHeader>
          <CardContent>
            <BarChart items={data.enrollment.bySection.map((s) => ({ label: `${s.name} (${s.studentCount})`, value: s.quizAverage }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Quizzes</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.quizzes.items.map((quiz) => (
              <div key={quiz.id} className="flex justify-between">
                <span>{quiz.title}</span>
                <span>avg {quiz.average}% · {quiz.attempted} attempted</span>
              </div>
            ))}
            {!data.quizzes.items.length && <p className="text-muted-foreground">No quizzes yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
