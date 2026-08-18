"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { attendanceService } from "@/services/attendance.service";
import { academicsService } from "@/services/academics.service";
import { teachersService } from "@/services/teachers.service";
import { PageLoader } from "@/components/layout/page-loader";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";

const STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"];

export default function TeacherAttendancePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [marks, setMarks] = useState<Record<string, string>>({});
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

  const selected = sections.find((s) => s.id === sectionId);

  const merged = useMemo(() => {
    const students = enrollments.data?.items ?? [];
    const byStudent = new Map((existing.data?.items ?? []).map((row) => [row.student?.id, row.status]));
    return students.map((enr) => ({
      studentId: enr.studentId,
      name: enr.student ? `${enr.student.firstName} ${enr.student.lastName}` : enr.studentId,
      status: marks[enr.studentId] ?? byStudent.get(enr.studentId) ?? "PRESENT",
    }));
  }, [enrollments.data, existing.data, marks]);

  const save = useMutation({
    mutationFn: () =>
      attendanceService.mark({
        academicYearId: selected?.academicYearId ?? "",
        sectionId,
        branchId: selected?.branchId ?? "",
        date,
        entries: merged.map((row) => ({ studentId: row.studentId, status: row.status })),
      }),
    onSuccess: () => {
      toast({ title: "Attendance saved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-dashboard"] });
    },
    onError: (err) => toast({ title: "Save failed", description: err instanceof ApiClientError ? err.message : "", variant: "error" }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader title="Today’s attendance" description="Pick a class. Tap Present or Absent. Save once." />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Class</Label>
          <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">Select</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </div>
        <div>
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button disabled={!sectionId || save.isPending} onClick={() => save.mutate()}>Save</Button>
        </div>
      </div>
      {sectionId && (
        <div className="rounded-lg border bg-card">
          {enrollments.isLoading || existing.isLoading ? (
            <PageLoader variant="panel" />
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {merged.map((row) => (
                  <TableRow key={row.studentId}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>
                      <Select value={row.status} onChange={(e) => setMarks((prev) => ({ ...prev, [row.studentId]: e.target.value }))}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
