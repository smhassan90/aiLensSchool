"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { EmptyState } from "@/components/layout/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { academicPlannerService } from "@/services/academic-planner.service";
import { formatStatusLabel } from "@/lib/display-labels";
import { formatDate } from "@/lib/utils";

export default function SchoolPlannerListPage() {
  const { hasAnyRole } = useAuth();
  const showApprovals = hasAnyRole(["PRINCIPAL", "SCHOOL_ADMIN"]);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["planners", { scope: "school" }],
    queryFn: () => academicPlannerService.list({ scope: "school" }),
  });

  return (
    <div>
      <PageHeader
        title="Academic planners"
        description="Review teacher plans, approvals, and published schedules for the school."
        actions={
          showApprovals ? (
            <Link href="/school/planner/approvals">
              <Button type="button" variant="outline" size="sm">Approval queue</Button>
            </Link>
          ) : undefined
        }
      />

      {isLoading && <PageLoader />}
      {isError && (
        <EmptyState
          title="Could not load planners"
          description={error instanceof Error ? error.message : "Try again later."}
        />
      )}

      {!isLoading && !isError && (data?.length ?? 0) === 0 && (
        <EmptyState
          icon={<CalendarRange className="h-10 w-10" />}
          title="No planners in this school yet"
          description="When teachers create planners they will appear here for review."
        />
      )}

      {data && data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Class</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Teacher</TableHead>
              <TableHead>Exam</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link
                    href={
                      row.workingVersionId
                        ? `/school/planner/${row.id}?v=${encodeURIComponent(row.workingVersionId)}`
                        : `/school/planner/${row.id}`
                    }
                    className="font-medium text-primary underline"
                  >
                    {row.classLabel || row.title}
                  </Link>
                </TableCell>
                <TableCell>{row.subjectName}</TableCell>
                <TableCell>{row.teacherName}</TableCell>
                <TableCell>{formatDate(row.examDate)}</TableCell>
                <TableCell>{formatStatusLabel(row.workingVersionStatus ?? row.status)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
