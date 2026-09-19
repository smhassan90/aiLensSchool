"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { headTeachersService } from "@/services/head-teachers.service";

export default function HeadTeacherAttendancePage() {
  const attendance = useQuery({
    queryKey: ["head-teacher-attendance"],
    queryFn: () => headTeachersService.getAttendance(),
  });

  if (attendance.isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader title="Attendance overview" />
        <PageLoader variant="page" />
      </div>
    );
  }

  const data = attendance.data;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Attendance overview"
        description={data ? `Last 30 days since ${data.since}` : undefined}
        actions={
          <Link href="/teacher/head">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      {data ? (
        <>
          <div className="mb-6 rounded-xl border bg-muted/20 px-4 py-3 text-sm">
            <span className="font-medium">{data.summary.classes} classes</span>
            {data.summary.attendanceRate != null ? ` · ${data.summary.attendanceRate}% overall attendance` : ""}
          </div>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Attendance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.classes.map((row) => (
                  <TableRow key={row.sectionId}>
                    <TableCell className="font-medium">{row.classLabel}</TableCell>
                    <TableCell>{row.enrolled}</TableCell>
                    <TableCell>{row.records}</TableCell>
                    <TableCell>{row.attendanceRate != null ? `${row.attendanceRate}%` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      ) : null}
    </div>
  );
}
