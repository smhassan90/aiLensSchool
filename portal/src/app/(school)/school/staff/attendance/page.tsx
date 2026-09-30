"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { localDateISO } from "@/lib/utils";
import { Clock } from "lucide-react";
import { TeacherAttendanceTabs } from "@/app/(school)/school/teachers/attendance/attendance-tabs";
import { staffAttendanceReportService } from "@/services/staff-attendance-report.service";
import Link from "next/link";

function formatCheckInTime(iso: string | null, timeZone: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function statusBadge(status: string | null) {
  if (status === "PRESENT") return <Badge variant="success">Present</Badge>;
  if (status === "LATE") return <Badge variant="warning">Late</Badge>;
  if (status === "ABSENT") return <Badge variant="destructive">Absent</Badge>;
  return <Badge variant="outline">Waiting</Badge>;
}

function sourceLabel(source: string | null) {
  if (source === "MACHINE") return "Machine";
  if (source === "SYSTEM") return "Auto";
  if (source === "ADMIN") return "Desk";
  return "—";
}

export default function StaffAttendancePage() {
  const { can } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const allowed =
    can("VIEW_TEACHER_ATTENDANCE_HISTORY") || can("MANAGE_STAFF") || can("MANAGE_TEACHERS");
  const canCheckIn = can("MANAGE_TEACHER_ATTENDANCE") || can("MANAGE_STAFF");

  const [date, setDate] = useState(() => localDateISO());
  const [staffUserId, setStaffUserId] = useState("");

  const day = useQuery({
    queryKey: ["staff-attendance-day", date],
    queryFn: () => staffAttendanceReportService.day(date),
    enabled: allowed,
  });

  const staff = useMemo(
    () =>
      [...(day.data?.staff ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [day.data?.staff],
  );
  const summary = day.data?.summary;
  const policy = day.data?.policy;
  const today = localDateISO();
  const isToday = date === today;

  const selected = staff.find((row) => row.staffUserId === staffUserId);
  const selectedReady = Boolean(staffUserId && isToday && selected && !selected.checkedInAt);

  const checkIn = useMutation({
    mutationFn: (id: string) => staffAttendanceReportService.manualCheckIn(id, date),
    onSuccess: () => {
      toast({ title: "Staff checked in", variant: "success" });
      setStaffUserId("");
      queryClient.invalidateQueries({ queryKey: ["staff-attendance-day"] });
    },
    onError: (err) =>
      toast({
        title: "Check-in failed",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Staff attendance"
        description="Office and principal staff — same fingerprint terminals and cut-off times as teachers."
      />
      <TeacherAttendanceTabs />
      {!allowed ? (
        <p className="text-sm text-muted-foreground">You do not have access to staff attendance.</p>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Map terminal users under{" "}
            <Link href="/school/setup/attendance?tab=mapping" className="text-primary underline">
              Map staff &amp; teachers
            </Link>
            . Late/absent cut-offs are shared with{" "}
            <Link href="/school/teachers/attendance" className="text-primary underline">
              teacher attendance
            </Link>
            .
          </p>

          {canCheckIn ? (
            <Card>
              <CardHeader>
                <CardTitle>Desk check-in</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <div>
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setStaffUserId("");
                    }}
                  />
                </div>
                <div>
                  <Label>Staff member</Label>
                  <Select
                    value={staffUserId}
                    onChange={(e) => setStaffUserId(e.target.value)}
                    disabled={!isToday || day.isLoading}
                  >
                    <option value="">Select staff</option>
                    {staff.map((row) => (
                      <option key={row.staffUserId} value={row.staffUserId} disabled={Boolean(row.checkedInAt)}>
                        {row.name}
                        {row.employeeCode ? ` · ${row.employeeCode}` : ""}
                        {row.checkedInAt ? " (checked in)" : ""}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    disabled={!isToday || !selectedReady || checkIn.isPending}
                    onClick={() => checkIn.mutate(staffUserId)}
                  >
                    {checkIn.isPending ? "Checking in…" : "Check in"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {day.isLoading ? (
            <PageLoader variant="panel" />
          ) : !staff.length ? (
            <EmptyState
              icon={<Clock className="h-8 w-8" />}
              title="No staff for attendance"
              description="Create principal or office staff under Setup → Staff access, and set an employee code for biometric mapping."
              action={
                <Link href="/school/staff">
                  <Button variant="outline">Staff access</Button>
                </Link>
              }
            />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {(summary?.present ?? 0) + (summary?.late ?? 0)} checked in
                {summary?.late ? ` · ${summary.late} late` : ""}
                {summary?.absent ? ` · ${summary.absent} absent` : ""}
                {summary?.waiting ? ` · ${summary.waiting} waiting` : ""}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead>Check-out</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((row) => (
                    <TableRow key={row.staffUserId}>
                      <TableCell>
                        <div className="font-medium">{row.name}</div>
                        {row.employeeCode ? (
                          <div className="text-xs text-muted-foreground">{row.employeeCode}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {formatCheckInTime(row.checkedInAt, policy?.timezone ?? "Asia/Karachi")}
                      </TableCell>
                      <TableCell>
                        {formatCheckInTime(row.checkedOutAt, policy?.timezone ?? "Asia/Karachi")}
                      </TableCell>
                      <TableCell>{statusBadge(row.status)}</TableCell>
                      <TableCell>{sourceLabel(row.source)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
