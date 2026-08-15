"use client";

import { PageLoader } from "@/components/layout/page-loader";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { insightsService } from "@/services/insights.service";
import { formatDate } from "@/lib/utils";
import { BarChart } from "@/components/charts/simple-charts";
import { ArrowLeft } from "lucide-react";

type Overview = {
  student: {
    firstName: string;
    lastName: string;
    studentCode: string;
    admissionNumber: string;
    status: string;
    grade?: { name: string };
    section?: { name: string };
    academicYear?: { name: string };
    parents?: Array<{ relationship: string; parent: { user: { firstName: string; lastName: string; email: string; username?: string; phone?: string } } }>;
  };
  attendance: { total: number; present: number; absent: number; late: number; rate: number; recent: Array<{ date: string; status: string }> };
  quizzes: { average: number; results: Array<{ id: string; title: string; subject: string; percentage: number; submittedAt: string }> };
  homework: Array<{ id: string; title: string; dueDate: string; subject?: { name: string } }>;
  diaries: Array<{ id: string; date: string; title: string; lessonSummary: string; homeworkNotes: string }>;
  reportCards: Array<{ id: string; termLabel: string; overallPercentage: number; attendanceRate: number; remarks?: string; lines?: Array<{ gradeLetter: string; average: number; subject: { name: string } }> }>;
  fees: { billed: number; paid: number; due: number; items: Array<{ periodLabel: string; status: string; amount: number; paidAmount: number }> };
};

export default function Student360Page() {
  const params = useParams<{ id: string }>();
  const query = useQuery({
    queryKey: ["student-360", params.id],
    queryFn: () => insightsService.student(params.id) as Promise<Overview>,
  });

  if (query.isLoading) {
    return <PageLoader variant="page" />;
  }
  if (!query.data) {
    return <div className="p-8">Student not found.</div>;
  }

  const data = query.data;
  const student = data.student;

  return (
    <div className="p-8">
      <PageHeader
        title={`${student.firstName} ${student.lastName}`}
        description={`${student.studentCode} · ${student.grade?.name ?? "Unassigned"} ${student.section?.name ?? ""} · ${student.academicYear?.name ?? ""}`}
        actions={
          <Link href="/school/students">
            <Button variant="outline"><ArrowLeft className="h-4 w-4" />Back</Button>
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-sm">Attendance</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data.attendance.rate}%</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Quiz average</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data.quizzes.average}%</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Fees due</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data.fees.due}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Status</CardTitle></CardHeader><CardContent><Badge variant={student.status === "ACTIVE" ? "success" : "secondary"}>{student.status}</Badge></CardContent></Card>
      </div>

      <Tabs defaultValue="progress">
        <TabsList>
          <TabsTrigger value="progress">Progress</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="quizzes">Quizzes</TabsTrigger>
          <TabsTrigger value="reports">Report cards</TabsTrigger>
          <TabsTrigger value="diary">Diary / homework</TabsTrigger>
          <TabsTrigger value="fees">Fees</TabsTrigger>
        </TabsList>

        <TabsContent value="progress" className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Quiz trend</CardTitle></CardHeader>
            <CardContent>
              <BarChart
                items={data.quizzes.results.map((r) => ({ label: r.subject, value: r.percentage }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Family</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(student.parents ?? []).map((p, i) => (
                <p key={i}>
                  {p.parent.user.firstName} {p.parent.user.lastName} · {p.relationship}
                  {p.parent.user.username ? ` · login ${p.parent.user.username}` : ""}
                  {p.parent.user.phone ? ` · ${p.parent.user.phone}` : ""}
                </p>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance">
          <Card>
            <CardContent className="pt-6">
              <p className="mb-4 text-sm text-muted-foreground">
                Present {data.attendance.present} · Absent {data.attendance.absent} · Late {data.attendance.late}
              </p>
              <div className="space-y-2">
                {data.attendance.recent.map((row) => (
                  <div key={row.date} className="flex justify-between text-sm">
                    <span>{formatDate(row.date)}</span>
                    <Badge variant={row.status === "PRESENT" ? "success" : row.status === "ABSENT" ? "destructive" : "warning"}>{row.status}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quizzes">
          <Card>
            <CardContent className="space-y-3 pt-6">
              {data.quizzes.results.length === 0 && <p className="text-sm text-muted-foreground">No quiz results yet.</p>}
              {data.quizzes.results.map((row) => (
                <div key={row.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{row.title}</p>
                    <p className="text-muted-foreground">{row.subject} · {formatDate(row.submittedAt)}</p>
                  </div>
                  <Badge>{row.percentage}%</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports">
          <div className="space-y-4">
            {data.reportCards.length === 0 && <p className="text-sm text-muted-foreground">No report cards generated yet.</p>}
            {data.reportCards.map((card) => (
              <Card key={card.id}>
                <CardHeader>
                  <CardTitle>{card.termLabel} · {card.overallPercentage}% · Attendance {card.attendanceRate}%</CardTitle>
                </CardHeader>
                <CardContent>
                  {card.remarks && <p className="mb-3 text-sm">{card.remarks}</p>}
                  <BarChart items={(card.lines ?? []).map((line) => ({ label: `${line.subject.name} (${line.gradeLetter})`, value: line.average }))} />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="diary" className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Home diary</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {data.diaries.map((d) => (
                <div key={d.id} className="rounded-md border p-3 text-sm">
                  <p className="font-medium">{formatDate(d.date)}</p>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{d.lessonSummary}</p>
                  <p className="mt-2"><span className="font-medium">Homework:</span> {d.homeworkNotes}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Homework</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.homework.map((h) => (
                <p key={h.id}>{h.subject?.name}: {h.title} · due {formatDate(h.dueDate)}</p>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fees">
          <Card>
            <CardContent className="space-y-2 pt-6 text-sm">
              {data.fees.items.map((item, i) => (
                <div key={i} className="flex justify-between">
                  <span>{item.periodLabel}</span>
                  <span>{item.paidAmount}/{item.amount} · {item.status}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
