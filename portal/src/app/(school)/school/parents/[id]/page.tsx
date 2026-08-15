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

type Child = {
  student: { id: string; firstName: string; lastName: string; studentCode: string; grade?: { name: string }; section?: { name: string } };
  attendance: { rate: number; recent: Array<{ date: string; status: string }> };
  quizzes: { average: number; results: Array<{ id: string; title: string; percentage: number }> };
  reportCards: Array<{ id: string; termLabel: string; overallPercentage: number; attendanceRate: number }>;
};

type ParentOverview = {
  parent: { firstName: string; lastName: string; email: string; phone?: string };
  children: Child[];
};

export default function ParentWalkInPage() {
  const params = useParams<{ id: string }>();
  const query = useQuery({
    queryKey: ["parent-overview", params.id],
    queryFn: () => insightsService.parent(params.id) as Promise<ParentOverview>,
  });

  if (query.isLoading) {
    return <PageLoader variant="page" />;
  }
  if (!query.data) return <div className="p-8">Parent not found.</div>;

  const { parent, children } = query.data;

  return (
    <div className="p-8">
      <PageHeader
        title={`${parent.firstName} ${parent.lastName}`}
        description={`${parent.phone ?? parent.email} · ${children.length} child(ren)`}
        actions={
          <Link href="/school/parents">
            <Button variant="outline"><ArrowLeft className="h-4 w-4" />Back</Button>
          </Link>
        }
      />

      {children.length === 0 && <p className="text-sm text-muted-foreground">No children linked.</p>}

      <Tabs defaultValue={children[0]?.student.id}>
        <TabsList>
          {children.map((child) => (
            <TabsTrigger key={child.student.id} value={child.student.id}>
              {child.student.firstName}
            </TabsTrigger>
          ))}
        </TabsList>
        {children.map((child) => (
          <TabsContent key={child.student.id} value={child.student.id} className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {child.student.studentCode} · {child.student.grade?.name} {child.student.section?.name}
              </p>
              <Link href={`/school/students/${child.student.id}`}>
                <Button size="sm" variant="outline">Open full profile</Button>
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card><CardHeader><CardTitle className="text-sm">Attendance</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{child.attendance.rate}%</CardContent></Card>
              <Card><CardHeader><CardTitle className="text-sm">Quiz average</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{child.quizzes.average}%</CardContent></Card>
              <Card><CardHeader><CardTitle className="text-sm">Latest report</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{child.reportCards[0]?.overallPercentage ?? "—"}{child.reportCards[0] ? "%" : ""}</CardContent></Card>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Quiz results</CardTitle></CardHeader>
                <CardContent>
                  <BarChart items={child.quizzes.results.map((r) => ({ label: r.title, value: r.percentage }))} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Recent attendance</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {child.attendance.recent.slice(0, 10).map((row) => (
                    <div key={row.date} className="flex justify-between text-sm">
                      <span>{formatDate(row.date)}</span>
                      <Badge variant={row.status === "PRESENT" ? "success" : row.status === "ABSENT" ? "destructive" : "warning"}>{row.status}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
