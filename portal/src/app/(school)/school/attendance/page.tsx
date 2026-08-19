"use client";

import { useMemo, useState } from "react";
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
import {
  AttendanceRoster,
  toPresentAbsent,
  type AttendanceMark,
} from "@/components/attendance/attendance-toggle";

export default function AttendancePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [marks, setMarks] = useState<Record<string, AttendanceMark>>({});
  const sections = useQuery({ queryKey: ["sections"], queryFn: () => academicsService.listSections({ limit: 100 }) });
  const years = useQuery({ queryKey: ["academic-years"], queryFn: () => academicsService.listYears({ limit: 20 }) });
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
  const section = sections.data?.items.find((s) => s.id === sectionId);
  const year = years.data?.items.find((y) => y.isCurrent) ?? years.data?.items[0];

  const merged = useMemo(() => {
    const students = enrollments.data?.items ?? [];
    const byStudent = new Map(
      (existing.data?.items ?? []).map((row) => [row.student?.id ?? "", toPresentAbsent(row.status)]),
    );
    return students.map((enr) => {
      const studentId = enr.student?.id ?? enr.studentId;
      return {
        studentId,
        name: enr.student ? `${enr.student.firstName} ${enr.student.lastName}` : studentId,
        status: marks[studentId] ?? byStudent.get(studentId) ?? "PRESENT",
      };
    });
  }, [enrollments.data, existing.data, marks]);

  const save = useMutation({
    mutationFn: () =>
      attendanceService.mark({
        academicYearId: year?.id ?? "",
        sectionId,
        branchId: section?.branchId ?? "",
        date,
        entries: merged.map((row) => ({ studentId: row.studentId, status: row.status })),
      }),
    onSuccess: () => {
      toast({ title: "Attendance saved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (err) =>
      toast({ title: "Save failed", description: err instanceof ApiClientError ? err.message : "", variant: "error" }),
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
            {sections.data?.items.map((s) => (
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
          <Button disabled={!sectionId || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save attendance"}
          </Button>
        </div>
      </div>
      {sectionId &&
        (enrollments.isLoading || existing.isLoading ? (
          <PageLoader variant="panel" />
        ) : (
          <AttendanceRoster
            rows={merged}
            onToggle={(studentId, status) => setMarks((prev) => ({ ...prev, [studentId]: status }))}
          />
        ))}
    </div>
  );
}
