"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/providers/auth-provider";
import { academicPlannerService } from "@/services/academic-planner.service";
import { formatStatusLabel } from "@/lib/display-labels";
import { formatDate } from "@/lib/utils";

export default function PlannerApprovalsPage() {
  const { hasAnyRole } = useAuth();
  const allowed = hasAnyRole(["PRINCIPAL", "SCHOOL_ADMIN"]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["planner-approvals"],
    queryFn: () => academicPlannerService.listApprovals(),
    enabled: allowed,
  });

  if (!allowed) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader title="Planner approvals" description="Only principals and school admins can review submissions." />
        <Link href="/school/planner">
          <Button type="button" variant="outline">All planners</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Planner approvals"
        description="Review submitted academic plans before teachers begin delivery."
        actions={
          <Link href="/school/planner">
            <Button type="button" variant="outline" size="sm">All planners</Button>
          </Link>
        }
      />

      {isLoading && <PageLoader />}
      {isError && (
        <EmptyState
          title="Could not load queue"
          description={error instanceof Error ? error.message : "Try again later."}
        />
      )}

      {data && data.planners.length === 0 && (!data.recoveries || data.recoveries.length === 0) && (
        <EmptyState title="No planners awaiting review" description="Submitted plans will appear here." />
      )}

      {data && data.recoveries && data.recoveries.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Schedule recoveries</h2>
          <p className="text-sm text-muted-foreground">
            Recovery proposals change the published plan only after you approve them.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Teacher</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recoveries.map((row) => (
                <TableRow key={row.versionId}>
                  <TableCell>
                    <Link
                      href={`/school/planner/${row.plannerId}?v=${encodeURIComponent(row.versionId)}`}
                      className="font-medium text-primary underline"
                    >
                      {row.classLabel ?? "Planner"}
                    </Link>
                  </TableCell>
                  <TableCell>{row.subjectName}</TableCell>
                  <TableCell>{row.teacherName}</TableCell>
                  <TableCell>{row.submittedAt ? formatDate(row.submittedAt) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data && data.planners.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Class</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Teacher</TableHead>
              <TableHead>Exam</TableHead>
              <TableHead>Feasibility</TableHead>
              <TableHead>Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.planners.map((row) => (
              <TableRow key={`${row.plannerId}-${row.versionId}`}>
                <TableCell>
                  <Link
                    href={`/school/planner/${row.plannerId}?v=${encodeURIComponent(row.versionId)}`}
                    className="font-medium text-primary underline"
                  >
                    {row.classLabel || row.title}
                  </Link>
                </TableCell>
                <TableCell>{row.subjectName}</TableCell>
                <TableCell>{row.teacherName}</TableCell>
                <TableCell>{formatDate(row.examDate)}</TableCell>
                <TableCell>
                  {row.summary?.feasibility
                    ? formatStatusLabel(row.summary.feasibility)
                    : "—"}
                </TableCell>
                <TableCell>{row.submittedAt ? formatDate(row.submittedAt) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
