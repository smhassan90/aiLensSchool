"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { teachersService } from "@/services/teachers.service";
import { localDateISO } from "@/lib/utils";

function statusBadge(status: string) {
  const s = status?.toUpperCase();
  if (s === "PRESENT") return <Badge variant="success">Present</Badge>;
  if (s === "LATE") return <Badge variant="warning">Late</Badge>;
  if (s === "ABSENT") return <Badge variant="destructive">Absent</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function formatTime(iso: string | null, timeZone: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

export default function TeacherStaffAttendancePage() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => localDateISO());
  const [teacherId, setTeacherId] = useState("");
  const [page, setPage] = useState(1);

  const supervision = useQuery({
    queryKey: ["teacher-supervision"],
    queryFn: () => teachersService.getSupervision(),
  });

  const history = useQuery({
    queryKey: ["teacher-self-attendance-history", startDate, endDate, teacherId, page],
    queryFn: () =>
      teachersService.attendanceHistory({
        startDate,
        endDate,
        teacherId: teacherId || undefined,
        page,
        limit: 25,
      }),
    enabled: Boolean(supervision.data),
  });

  if (supervision.isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageLoader variant="page" />
      </div>
    );
  }

  const self = supervision.data?.self;
  const supervised = supervision.data?.supervisedTeachers ?? [];
  const canSupervise = supervised.length > 0;

  if (!canSupervise) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader
          title="Staff attendance"
          description="You do not supervise other teachers."
          actions={
            <Link href="/teacher/my-attendance">
              <Button variant="outline">My attendance</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const rows = history.data?.data ?? [];
  const timeZone = history.data?.timezone ?? "Asia/Karachi";
  const totalPages = history.data?.totalPages ?? 1;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Staff attendance"
        description="Attendance for teachers in your head-teacher or coordinator scope."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/teacher/head">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4" />
                Academic insights
              </Button>
            </Link>
            <Link href="/teacher/my-attendance">
              <Button variant="outline">My attendance</Button>
            </Link>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Label>Teacher</Label>
          <Select
            value={teacherId}
            onChange={(e) => {
              setTeacherId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All supervised teachers</option>
            {self ? (
              <option value={self.id}>{self.name} (me)</option>
            ) : null}
            {supervised.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} · {row.employeeCode}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>From</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <Label>To</Label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {supervised.map((row) => (
          <Link key={row.id} href={`/teacher/staff/${row.id}/overview`}>
            <Button variant="outline" size="sm">
              360 · {row.name}
            </Button>
          </Link>
        ))}
      </div>

      <div className="rounded-lg border bg-card">
        {history.isLoading ? (
          <PageLoader variant="panel" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Teacher</TableHead>
                <TableHead>In</TableHead>
                <TableHead>Out</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">360</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.teacher.id}-${row.date}`}>
                  <TableCell>{row.date}</TableCell>
                  <TableCell className="font-medium">{row.teacher.name}</TableCell>
                  <TableCell>{formatTime(row.checkInTime, timeZone)}</TableCell>
                  <TableCell>{formatTime(row.checkOutTime, timeZone)}</TableCell>
                  <TableCell>{statusBadge(row.status)}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/teacher/staff/${row.teacher.id}/overview`}>
                      <Button variant="ghost" size="sm">Open</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {totalPages > 1 ? (
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
