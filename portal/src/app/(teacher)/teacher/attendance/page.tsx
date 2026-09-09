"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/layout/empty-state";
import { attendanceService } from "@/services/attendance.service";
import { academicsService } from "@/services/academics.service";
import { teachersService } from "@/services/teachers.service";
import { PageLoader } from "@/components/layout/page-loader";
import { useToast } from "@/providers/toast-provider";
import { localDateISO } from "@/lib/utils";
import {
  AttendanceRoster,
  toPresentAbsent,
  type AttendanceMark,
} from "@/components/attendance/attendance-toggle";
import { ClipboardCheck } from "lucide-react";

export default function TeacherAttendancePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(() => localDateISO());
  const [marks, setMarks] = useState<Record<string, AttendanceMark>>({});
  const classes = useQuery({ queryKey: ["teacher-classes"], queryFn: () => teachersService.myClasses() });
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

  const sections = useMemo(() => {
    const seen = new Map<string, { id: string; label: string; branchId: string; academicYearId: string }>();
    for (const cls of classes.data ?? []) {
      if (!cls.isClassTeacher) continue;
      if (!seen.has(cls.sectionId)) {
        seen.set(cls.sectionId, {
          id: cls.sectionId,
          label: `${cls.gradeName} ${cls.sectionName}`,
          branchId: cls.branchId,
          academicYearId: cls.academicYearId,
        });
      }
    }
    return Array.from(seen.values());
  }, [classes.data]);

  useEffect(() => {
    if (sectionId && !sections.some((s) => s.id === sectionId)) {
      setSectionId("");
      setMarks({});
    }
  }, [sectionId, sections]);

  const selected = sections.find((s) => s.id === sectionId);

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
    mutationFn: () => {
      if (!merged.length) throw new Error("No students in this class to mark");
      if (!selected?.academicYearId || !selected.branchId) throw new Error("Class details incomplete");
      return attendanceService.mark({
        academicYearId: selected.academicYearId,
        sectionId,
        branchId: selected.branchId,
        date,
        entries: merged.map((row) => ({ studentId: row.studentId, status: row.status })),
      });
    },
    onSuccess: () => {
      toast({ title: "Attendance saved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-dashboard"] });
    },
    onError: (err) =>
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "",
        variant: "error",
      }),
  });

  if (classes.isLoading) {
    return <PageLoader variant="page" />;
  }

  if (!sections.length) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader
          title="Today’s attendance"
          description="Attendance is marked by the class teacher of each section."
        />
        <EmptyState
          icon={<ClipboardCheck className="h-10 w-10" />}
          title="No class teacher role"
          description="You are not assigned as class teacher for any section, so there is no attendance register for you to mark."
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Today’s attendance"
        description="Mark the register for sections where you are the class teacher. Everyone starts present until you tap Absent."
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Class</Label>
          <Select
            value={sectionId}
            onChange={(e) => {
              setSectionId(e.target.value);
              setMarks({});
            }}
          >
            <option value="">Select</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
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
          <Button disabled={!sectionId || !merged.length || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      {sectionId &&
        (enrollments.isLoading || existing.isLoading ? (
          <PageLoader variant="panel" />
        ) : enrollments.isError ? (
          <p className="text-sm text-destructive">Could not load students. Try again.</p>
        ) : merged.length === 0 ? (
          <p className="text-sm text-muted-foreground">No students enrolled in this class yet.</p>
        ) : (
          <AttendanceRoster
            rows={merged}
            onToggle={(studentId, status) => setMarks((prev) => ({ ...prev, [studentId]: status }))}
          />
        ))}
    </div>
  );
}
