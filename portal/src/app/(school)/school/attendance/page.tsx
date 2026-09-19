"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { attendanceService } from "@/services/attendance.service";
import { academicsService } from "@/services/academics.service";
import { PageLoader } from "@/components/layout/page-loader";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { localDateISO } from "@/lib/utils";
import {
  AttendanceRoster,
  toPresentAbsent,
  type AttendanceMark,
} from "@/components/attendance/attendance-toggle";

export default function AttendancePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(() => localDateISO());
  const [marks, setMarks] = useState<Record<string, AttendanceMark>>({});
  const saving = useRef(false);
  const sections = useQuery({ queryKey: ["sections"], queryFn: () => academicsService.listSections({ limit: 100 }) });
  const enrollments = useQuery({
    queryKey: ["enrollments", sectionId],
    queryFn: () => academicsService.listEnrollments({ sectionId, limit: 100 }),
    enabled: Boolean(sectionId),
  });
  const existing = useQuery({
    queryKey: ["attendance", sectionId, date],
    queryFn: () => attendanceService.list({ sectionId, date, limit: 100 }),
    enabled: Boolean(sectionId),
  });
  const sectionOptions = useMemo(() => sections.data?.items ?? [], [sections.data?.items]);
  const section = sectionOptions.find((s) => s.id === sectionId);
  const academicYearId = enrollments.data?.items[0]?.academicYearId;

  useEffect(() => {
    if (sectionId && !sectionOptions.some((s) => s.id === sectionId)) {
      setSectionId("");
      setMarks({});
      return;
    }
    if (sectionOptions.length === 1 && !sectionId) {
      setSectionId(sectionOptions[0].id);
    }
  }, [sectionId, sectionOptions]);

  const merged = useMemo(() => {
    const students = enrollments.data?.items ?? [];
    const byStudent = new Map(
      (existing.data?.items ?? []).map((row) => [row.student?.id ?? "", row]),
    );
    const rows = new Map<
      string,
      {
        studentId: string;
        name: string;
        status: AttendanceMark;
        dayOff?: { reason: string; status: "PENDING" | "APPROVED" | "REJECTED" };
      }
    >();
    for (const enr of students) {
      const studentId = enr.student?.id ?? enr.studentId;
      if (!studentId || rows.has(studentId)) continue;
      const dayOffRequest = byStudent.get(studentId)?.student?.dayOffRequests?.[0];
      rows.set(studentId, {
        studentId,
        name: enr.student ? `${enr.student.firstName} ${enr.student.lastName}` : studentId,
        status: marks[studentId] ?? toPresentAbsent(byStudent.get(studentId)?.status) ?? "PRESENT",
        dayOff: dayOffRequest
          ? { reason: dayOffRequest.reason, status: dayOffRequest.status as "PENDING" | "APPROVED" | "REJECTED" }
          : undefined,
      });
    }
    return Array.from(rows.values());
  }, [enrollments.data, existing.data, marks]);

  const canSave =
    Boolean(sectionId) &&
    Boolean(section?.branchId) &&
    Boolean(academicYearId) &&
    merged.length > 0 &&
    !sections.isLoading &&
    !enrollments.isLoading;

  const save = useMutation({
    mutationFn: async () => {
      if (saving.current) return;
      saving.current = true;
      if (!merged.length) throw new Error("No students in this class to mark");
      if (!academicYearId || !section?.branchId) {
        throw new Error("Class details are still loading. Wait a moment and try again.");
      }
      return attendanceService.mark({
        academicYearId,
        sectionId,
        branchId: section.branchId,
        date,
        entries: merged.map((row) => ({ studentId: row.studentId, status: row.status })),
      });
    },
    onSuccess: () => {
      toast({ title: "Attendance saved", variant: "success" });
      setMarks({});
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (err) =>
      toast({
        title: "Save failed",
        description: err instanceof ApiClientError || err instanceof Error ? err.message : "",
        variant: "error",
      }),
    onSettled: () => {
      saving.current = false;
    },
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader title="Attendance" description="Everyone is present until you tap Absent. Save once." />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Section</Label>
          <Select
            value={sectionId}
            onChange={(e) => {
              setSectionId(e.target.value);
              setMarks({});
            }}
          >
            <option value="">Select</option>
            {sectionOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.grade?.name} {s.name}
              </option>
            ))}
          </Select>
        </div>
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
          <Button disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save attendance"}
          </Button>
        </div>
      </div>
      {sectionId &&
        (enrollments.isLoading || existing.isLoading ? (
          <PageLoader variant="panel" />
        ) : merged.length === 0 ? (
          <p className="text-sm text-muted-foreground">No students enrolled in this section yet.</p>
        ) : (
          <AttendanceRoster
            rows={merged}
            onToggle={(studentId, status) => setMarks((prev) => ({ ...prev, [studentId]: status }))}
          />
        ))}
    </div>
  );
}
