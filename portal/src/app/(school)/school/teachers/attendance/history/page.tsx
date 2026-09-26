"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TeacherAttendanceTabs } from "../attendance-tabs";
import { teacherAttendanceReportService } from "@/services/teacher-attendance-report.service";
import { useAuth } from "@/providers/auth-provider";
import { localDateISO } from "@/lib/utils";
import { History } from "lucide-react";
import Link from "next/link";

function formatTime(iso: string | null, timeZone: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

export default function TeacherAttendanceHistoryPage() {
  const { can } = useAuth();
  const allowed = can("VIEW_TEACHER_ATTENDANCE_HISTORY") || can("MANAGE_TEACHERS");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => localDateISO());
  const [teacherId, setTeacherId] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  const teachers = useQuery({
    queryKey: ["teacher-attendance-teachers"],
    queryFn: () => teacherAttendanceReportService.teachers(),
    enabled: allowed,
  });

  const history = useQuery({
    queryKey: ["teacher-attendance-history", startDate, endDate, teacherId, page],
    queryFn: () =>
      teacherAttendanceReportService.list({
        startDate,
        endDate,
        teacherId: teacherId || undefined,
        page,
        limit,
      }),
    enabled: allowed,
  });

  const rows = history.data?.data ?? [];
  const timeZone = history.data?.timezone ?? "Asia/Karachi";

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Teacher attendance"
        description="Filter by date range and teacher. Biometric punches appear after device users are mapped."
      />
      <TeacherAttendanceTabs />
      {!allowed ? (
        <p className="text-sm text-muted-foreground">You do not have access to attendance history.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label>From</Label>
              <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} />
            </div>
            <div>
              <Label>To</Label>
              <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} />
            </div>
            <div>
              <Label>Teacher</Label>
              <Select value={teacherId} onChange={(e) => { setTeacherId(e.target.value); setPage(1); }}>
                <option value="">All teachers</option>
                {(teachers.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.employeeCode}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button variant="outline" onClick={() => { setTeacherId(""); setPage(1); }}>
                Clear teacher
              </Button>
            </div>
          </div>

          {history.isLoading ? (
            <PageLoader variant="panel" />
          ) : !rows.length ? (
            <EmptyState
              icon={<History className="h-8 w-8" />}
              title="No attendance in this range"
              description="Map device users on the Device sync tab, or check in teachers from Today."
              action={
                <Link href="/school/teachers/attendance/devices" className="text-sm text-primary underline">
                  Open device sync
                </Link>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead>Check-out</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={`${row.date}-${row.teacher.id}`}>
                      <TableCell>{row.date}</TableCell>
                      <TableCell>
                        <div className="font-medium">{row.teacher.name}</div>
                        <div className="text-xs text-muted-foreground">{row.teacher.employeeCode}</div>
                      </TableCell>
                      <TableCell>{formatTime(row.checkInTime, timeZone)}</TableCell>
                      <TableCell>{formatTime(row.checkOutTime, timeZone)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.status}</Badge>
                      </TableCell>
                      <TableCell>{row.source === "MACHINE" ? "Device" : row.source}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Page {history.data?.page ?? 1} of {history.data?.totalPages ?? 1} · {history.data?.total ?? 0} rows
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= (history.data?.totalPages ?? 1)}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
