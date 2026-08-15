"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dashboardService } from "@/services/dashboard.service";
import { PageLoader } from "@/components/layout/page-loader";

export default function SchoolDashboardPage() {
  const dashboard = useQuery({
    queryKey: ["school-dashboard"],
    queryFn: () => dashboardService.school(),
  });
  const data = dashboard.data;

  if (dashboard.isLoading) {
    return (
      <div className="p-8">
        <PageHeader title="Dashboard" description="School overview. Use search above to open a child or class instantly." />
        <PageLoader
          variant="page"
          phrases={["Counting students and classes", "Checking fees and recent scores", "Almost ready"]}
        />
      </div>
    );
  }

  return (
    <div className="p-8">
      <PageHeader title="Dashboard" description="School overview. Use search above to open a child or class instantly." />
      <div className="grid gap-4 sm:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-sm">Students</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data?.studentCount ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Teachers</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data?.teacherCount ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Classes</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data?.classCount ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Fees outstanding</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{data?.feesOutstanding ?? "—"}</CardContent></Card>
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Classes</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(data?.classes ?? []).map((c) => (
              <Link key={c.id} href={`/school/academics/grades/${c.id}/analytics`} className="block hover:underline">
                {c.name} · {c._count?.sections ?? 0} sections · {c._count?.enrollments ?? 0} students
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Latest quiz results</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(data?.latestResults ?? []).map((r) => (
              <p key={r.id}>{r.student ? `${r.student.firstName} ${r.student.lastName}` : "Student"} · {r.quiz?.title} · {Number(r.percentage)}%</p>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
