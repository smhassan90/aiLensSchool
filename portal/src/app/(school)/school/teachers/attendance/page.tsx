"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { teachersService } from "@/services/teachers.service";
import { PageLoader } from "@/components/layout/page-loader";
import { useAuth } from "@/providers/auth-provider";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import {
  AttendanceRoster,
  toPresentAbsent,
  type AttendanceMark,
} from "@/components/attendance/attendance-toggle";

export default function TeacherAttendancePage() {
  const { can } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [marks, setMarks] = useState<Record<string, AttendanceMark>>({});

  const roster = useQuery({
    queryKey: ["teacher-attendance", date],
    queryFn: () => teachersService.listAttendance(date),
    enabled: can("MANAGE_TEACHERS"),
  });

  const merged = useMemo(() => {
    return (roster.data ?? []).map((row) => ({
      studentId: row.teacherId,
      name: `${row.name}${row.employeeCode ? ` · ${row.employeeCode}` : ""}`,
      status: marks[row.teacherId] ?? toPresentAbsent(row.status),
    }));
  }, [roster.data, marks]);

  const save = useMutation({
    mutationFn: () =>
      teachersService.markAttendance({
        date,
        entries: merged.map((row) => ({ teacherId: row.studentId, status: row.status })),
      }),
    onSuccess: () => {
      toast({ title: "Teacher attendance saved", variant: "success" });
      setMarks({});
      queryClient.invalidateQueries({ queryKey: ["teacher-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-scoreboard"] });
    },
    onError: (err) =>
      toast({
        title: "Save failed",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Teacher attendance"
        description="Admin marks this. It counts toward the principal’s teacher ranking."
      />
      {!can("MANAGE_TEACHERS") ? (
        <p className="text-sm text-muted-foreground">Ask the school admin to mark teacher attendance.</p>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setMarks({});
                }}
              />
            </div>
            <div className="flex items-end">
              <Button disabled={save.isPending || !merged.length} onClick={() => save.mutate()}>
                {save.isPending ? "Saving…" : "Save attendance"}
              </Button>
            </div>
          </div>
          {roster.isLoading ? (
            <PageLoader variant="panel" />
          ) : (
            <AttendanceRoster
              rows={merged}
              onToggle={(teacherId, status) => setMarks((prev) => ({ ...prev, [teacherId]: status }))}
            />
          )}
        </>
      )}
    </div>
  );
}
