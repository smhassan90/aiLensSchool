"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { schoolsService } from "@/services/schools.service";
import {
  Building2,
  GitBranch,
  GraduationCap,
  School,
  Sparkles,
  Users,
} from "lucide-react";

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <p className="text-3xl font-semibold tracking-tight">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function SuperAdminDashboardPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["super-admin", "dashboard-stats"],
    queryFn: () => schoolsService.dashboardStats(),
  });

  return (
    <div className="p-8">
      <PageHeader
        title="Platform Dashboard"
        description="Overview of schools, users, and platform activity"
      />

      {isError && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Schools" value={data?.totalSchools ?? 0} icon={School} loading={isLoading} />
        <StatCard title="Active Schools" value={data?.activeSchools ?? 0} icon={Building2} loading={isLoading} />
        <StatCard title="Branches" value={data?.totalBranches ?? 0} icon={GitBranch} loading={isLoading} />
        <StatCard title="Students" value={data?.totalStudents ?? 0} icon={GraduationCap} loading={isLoading} />
        <StatCard title="Teachers" value={data?.totalTeachers ?? 0} icon={Users} loading={isLoading} />
        <StatCard title="Parents" value={data?.totalParents ?? 0} icon={Users} loading={isLoading} />
        <StatCard title="AI Requests" value={data?.aiRequests ?? 0} icon={Sparkles} loading={isLoading} />
        <StatCard
          title="Monthly Revenue"
          value={data?.monthlyRevenue != null ? `PKR ${Number(data.monthlyRevenue).toLocaleString()}` : "—"}
          icon={Building2}
          loading={isLoading}
        />
      </div>
    </div>
  );
}
