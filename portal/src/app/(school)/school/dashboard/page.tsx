"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { studentsService } from "@/services/students.service";
import { teachersService } from "@/services/teachers.service";
import { feesService } from "@/services/fees.service";
import { academicsService } from "@/services/academics.service";
import { resultsService } from "@/services/results.service";

export default function SchoolDashboardPage() {
  const students = useQuery({ queryKey: ["students"], queryFn: () => studentsService.list({ limit: 1 }) });
  const teachers = useQuery({ queryKey: ["teachers"], queryFn: () => teachersService.list({ limit: 1 }) });
  const classes = useQuery({ queryKey: ["grades"], queryFn: () => academicsService.listGrades({ limit: 20 }) });
  const fees = useQuery({ queryKey: ["fees"], queryFn: () => feesService.list({ limit: 50 }) });
  const results = useQuery({ queryKey: ["results"], queryFn: () => resultsService.list({ limit: 20 }) });

  const due = (fees.data?.items ?? []).reduce((sum, row) => sum + (row.balance ?? row.amount - row.paidAmount), 0);

  return (
    <div className="p-8">
      <PageHeader title="Dashboard" description="School overview. Use search above to open a child or class instantly." />
      <div className="grid gap-4 sm:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-sm">Students</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{students.data?.total ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Teachers</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{teachers.data?.total ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Classes</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{classes.data?.total ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Fees outstanding</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{due}</CardContent></Card>
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Classes</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {classes.data?.items.map((c) => (
              <Link key={c.id} href={`/school/academics/grades/${c.id}/analytics`} className="block hover:underline">
                {c.name} · {c._count?.sections ?? 0} sections · {c._count?.enrollments ?? 0} students
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Latest quiz results</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(results.data?.items ?? []).slice(0, 8).map((r) => (
              <p key={r.id}>{r.student ? `${r.student.firstName} ${r.student.lastName}` : "Student"} · {r.quiz?.title} · {Number(r.percentage)}%</p>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
