"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { dashboardService } from "@/services/dashboard.service";
import { PageLoader } from "@/components/layout/page-loader";
import { CombinedFinanceChart } from "@/components/charts/simple-charts";
import { useAuth } from "@/providers/auth-provider";

const EXPENSE_COLORS: Record<string, string> = {
  TEACHER_SALARY: "#0f766e",
  ADMIN_SALARY: "#115e59",
  ELECTRICITY: "#f59e0b",
  GAS: "#f97316",
  WATER: "#38bdf8",
  RENT: "#6366f1",
  REPAIR: "#ef4444",
  SUPPLIES: "#8b5cf6",
  TRANSPORT: "#14b8a6",
  MISC: "#94a3b8",
};

function Stat({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default function SchoolDashboardPage() {
  const { can } = useAuth();
  const dashboard = useQuery({
    queryKey: ["school-dashboard"],
    queryFn: () => dashboardService.school(),
  });
  const data = dashboard.data;

  if (dashboard.isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader title="School at a glance" description="Who is enrolled, who teaches whom, and how fees look this month." />
        <PageLoader variant="page" phrases={["Counting students", "Checking fees", "Almost ready"]} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="School at a glance"
        description="One screen for the principal: people, classes, money in, money out."
        actions={
          !data?.setupCompleted && can("MANAGE_CLASSES") ? (
            <Link href="/school/setup/wizard">
              <Button>Finish school setup</Button>
            </Link>
          ) : undefined
        }
      />

      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        <Stat label="Students enrolled" value={data?.studentCount ?? "—"} hint="Active students in the school" />
        <Stat label="Teachers" value={data?.teacherCount ?? "—"} hint="Teaching staff on the system" />
        <Stat label="Collected this month" value={data?.feesCollectedThisMonth ?? "—"} hint="Fee payments received" />
        <Stat label="Still due this month" value={data?.feesRemainingThisMonth ?? "—"} hint="Not fully paid yet" />
      </div>

      {can("VIEW_FINANCE") && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Fees in vs money out</CardTitle>
            <p className="text-sm text-muted-foreground">
              Teal bar is fees collected. The stacked bar is spend — each colour is salary, electricity, repair, and so on.
            </p>
          </CardHeader>
          <CardContent>
            <CombinedFinanceChart
              items={data?.financeMonths ?? []}
              categories={data?.expenseCategories ?? []}
              colors={EXPENSE_COLORS}
            />
          </CardContent>
        </Card>
      )}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Who teaches which class</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.classTeachers ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Assign a class teacher from Classes when you are ready.</p>
          )}
          {(data?.classTeachers ?? []).map((row) => (
            <div key={row.sectionId} className="rounded-lg border p-3">
              <p className="font-medium">
                {row.className} <span className="text-sm font-normal text-muted-foreground">· {row.students} students</span>
              </p>
              <p className="mt-1 text-sm">
                Class teacher: {row.classTeacher ?? <span className="text-amber-700">Not assigned</span>}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {row.subjects.map((s) => `${s.subject}: ${s.teacher}`).join(" · ") || "No subject teachers yet"}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
