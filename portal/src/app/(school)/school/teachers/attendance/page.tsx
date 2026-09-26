"use client";

import { useEffect, useMemo, useState } from "react";
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
import { teachersService, type TeacherAttendanceStatus } from "@/services/teachers.service";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { localDateISO } from "@/lib/utils";
import { Clock } from "lucide-react";
import { TeacherAttendanceTabs } from "./attendance-tabs";

function formatCheckInTime(iso: string | null, timeZone: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function statusBadge(status: TeacherAttendanceStatus | null) {
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

export default function TeacherAttendancePage() {
  const { can } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => localDateISO());
  const [teacherId, setTeacherId] = useState("");
  const [lateAfter, setLateAfter] = useState("08:15");
  const [absentAfter, setAbsentAfter] = useState("09:00");

  const day = useQuery({
    queryKey: ["teacher-attendance", date],
    queryFn: () => teachersService.listAttendance(date),
    enabled: can("MANAGE_TEACHERS"),
  });

  const policy = day.data?.policy;
  const teachers = useMemo(
    () =>
      [...(day.data?.teachers ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [day.data?.teachers],
  );
  const summary = day.data?.summary;
  const today = localDateISO();
  const isToday = date === today;

  useEffect(() => {
    if (!policy) return;
    setLateAfter(policy.lateAfter);
    setAbsentAfter(policy.absentAfter);
  }, [policy?.lateAfter, policy?.absentAfter]);

  const waitingTeachers = teachers.filter((row) => !row.checkedInAt);
  const selectedReady = waitingTeachers.some((row) => row.teacherId === teacherId);

  const savePolicy = useMutation({
    mutationFn: () =>
      teachersService.updateAttendancePolicy({
        teacherLateAfter: lateAfter.slice(0, 5),
        teacherAbsentAfter: absentAfter.slice(0, 5),
      }),
    onSuccess: (res) => {
      toast({ title: `Late after ${res.lateAfter} · absent after ${res.absentAfter}`, variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["teacher-attendance"] });
    },
    onError: (err) =>
      toast({
        title: "Could not save cut-off times",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      }),
  });

  const checkIn = useMutation({
    mutationFn: (id: string) => teachersService.checkIn(id),
    onSuccess: (res, id) => {
      const teacher = teachers.find((row) => row.teacherId === id);
      const time = formatCheckInTime(res.checkedInAt, policy?.timezone ?? "Asia/Karachi");
      toast({
        title: res.alreadyCheckedIn
          ? `${teacher?.name ?? "Teacher"} already checked in at ${time}`
          : `${teacher?.name ?? "Teacher"} checked in at ${time}`,
        variant: res.alreadyCheckedIn ? "default" : "success",
      });
      setTeacherId("");
      queryClient.invalidateQueries({ queryKey: ["teacher-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["school-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-scoreboard"] });
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
        title="Teacher attendance"
        description="Desk check-in for today, history reports, and ZKTeco device sync."
      />
      <TeacherAttendanceTabs />
      {!can("MANAGE_TEACHERS") ? (
        <p className="text-sm text-muted-foreground">Ask the school admin to check teachers in.</p>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cut-off times</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="late-after">Late after</Label>
                <Input
                  id="late-after"
                  type="time"
                  value={lateAfter}
                  onChange={(e) => setLateAfter(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="absent-after">Absent after</Label>
                <Input
                  id="absent-after"
                  type="time"
                  value={absentAfter}
                  onChange={(e) => setAbsentAfter(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  disabled={savePolicy.isPending || !day.data}
                  onClick={() => savePolicy.mutate()}
                >
                  {savePolicy.isPending ? "Saving…" : "Save times"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-3">
                Arrival from {lateAfter} is late. Arrival from {absentAfter} is absent, and anyone not
                checked in after that time is marked absent.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Check in</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setTeacherId("");
                  }}
                />
              </div>
              <div>
                <Label>Teacher</Label>
                <Select
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  disabled={!isToday || day.isLoading}
                >
                  <option value="">Select a teacher</option>
                  {waitingTeachers.map((row) => (
                    <option key={row.teacherId} value={row.teacherId}>
                      {row.name}
                      {row.employeeCode ? ` · ${row.employeeCode}` : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  disabled={!isToday || !selectedReady || checkIn.isPending}
                  onClick={() => checkIn.mutate(teacherId)}
                >
                  {checkIn.isPending ? "Checking in…" : "Check in"}
                </Button>
              </div>
              {!isToday ? (
                <p className="text-xs text-muted-foreground sm:col-span-3">
                  Check-in is only for today. Change the date to review earlier punches.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {day.isLoading ? (
            <PageLoader variant="panel" />
          ) : !teachers.length ? (
            <EmptyState
              icon={<Clock className="h-8 w-8" />}
              title="No active teachers"
              description="Add teachers first, then check them in here."
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
                    <TableHead>Teacher</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead>Check-out</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teachers.map((row) => (
                    <TableRow key={row.teacherId}>
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
