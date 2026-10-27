"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
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

export default function TeacherPlannerListPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["planners", { scope: "mine" }],
    queryFn: () => academicPlannerService.list({ scope: "mine" }),
  });

  return (
    <div>
      <PageHeader
        title="Academic planner"
        description="Plan lessons from the school library through to your exam date."
        actions={
          <Link href="/teacher/planner/new">
            <Button type="button">
              <Plus className="h-4 w-4" />
              New planner
            </Button>
          </Link>
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
          title="No planners yet"
          description="Create a planner for one of your classes to schedule library chapters before the exam."
          action={
            <Link href="/teacher/planner/new">
              <Button type="button">Create planner</Button>
            </Link>
          }
        />
      )}

      {data && data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Class</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Exam</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link
                    href={`/teacher/planner/${row.id}`}
                    className="font-medium text-primary underline"
                  >
                    {row.classLabel || row.title}
                  </Link>
                </TableCell>
                <TableCell>{row.subjectName}</TableCell>
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
