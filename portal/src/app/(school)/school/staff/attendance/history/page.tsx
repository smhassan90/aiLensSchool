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
import { TeacherAttendanceTabs } from "@/app/(school)/school/teachers/attendance/attendance-tabs";
import { staffAttendanceReportService } from "@/services/staff-attendance-report.service";
import { useAuth } from "@/providers/auth-provider";
import { localDateISO } from "@/lib/utils";
import { History } from "lucide-react";

function formatTime(iso: string | null, timeZone: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function statusBadge(status: string) {
  const normalized = status?.toUpperCase();
  if (normalized === "PRESENT") return <Badge variant="success">Present</Badge>;
  if (normalized === "LATE") return <Badge variant="warning">Late</Badge>;
  if (normalized === "ABSENT") return <Badge variant="destructive">Absent</Badge>;
  return <Badge variant="outline">{status || "—"}</Badge>;
}

export default function StaffAttendanceHistoryPage() {
  const { can } = useAuth();
  const allowed =
    can("VIEW_TEACHER_ATTENDANCE_HISTORY") || can("MANAGE_STAFF") || can("MANAGE_TEACHERS");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => localDateISO());
  const [staffUserId, setStaffUserId] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  const members = useQuery({
    queryKey: ["staff-attendance-members"],
    queryFn: () => staffAttendanceReportService.members(),
    enabled: allowed,
  });

  const history = useQuery({
    queryKey: ["staff-attendance-history", startDate, endDate, staffUserId, page],
    queryFn: () =>
      staffAttendanceReportService.list({
        startDate,
        endDate,
        staffUserId: staffUserId || undefined,
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
        title="Staff attendance"
        description="History for principal and office staff. Biometric punches appear after device mapping."
      />
      <TeacherAttendanceTabs />
      {!allowed ? (
        <p className="text-sm text-muted-foreground">You do not have access to staff attendance history.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
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
            <div>
              <Label>Staff member</Label>
              <Select
                value={staffUserId}
                onChange={(e) => {
                  setStaffUserId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All staff</option>
                {(members.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.employeeCode ? ` · ${t.employeeCode}` : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button variant="outline" onClick={() => { setStaffUserId(""); setPage(1); }}>
                Clear filter
              </Button>
            </div>
          </div>

          {history.isLoading ? (
            <PageLoader variant="panel" />
          ) : !rows.length ? (
            <EmptyState
              icon={<History className="h-8 w-8" />}
              title="No records"
              description="Try another date range or map staff on the fingerprint terminal."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead>Check-out</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={`${row.date}-${row.staff.id}`}>
                      <TableCell>{row.date}</TableCell>
                      <TableCell>
                        {row.staff.name}
                        {row.staff.employeeCode ? (
                          <span className="block text-xs text-muted-foreground">{row.staff.employeeCode}</span>
                        ) : null}
                      </TableCell>
                      <TableCell>{formatTime(row.checkInTime, timeZone)}</TableCell>
                      <TableCell>{formatTime(row.checkOutTime, timeZone)}</TableCell>
                      <TableCell>{statusBadge(row.status)}</TableCell>
                      <TableCell>{row.source === "MACHINE" ? "Machine" : row.source === "ADMIN" ? "Desk" : row.source}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={page >= (history.data?.totalPages ?? 1)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
