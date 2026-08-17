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
import { PageLoader } from "@/components/layout/page-loader";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";

const STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"];

export default function AttendancePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [marks, setMarks] = useState<Record<string, string>>({});
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
    onError: (err) => toast({ title: "Save failed", description: err instanceof ApiClientError ? err.message : "", variant: "error" }),
  });

  return (
    <div className="p-8">
      <PageHeader title="Attendance" description="Mark a section for a date" />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Section</Label>
          <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">Select</option>
            {sections.data?.items.map((s) => <option key={s.id} value={s.id}>{s.grade?.name} {s.name}</option>)}
          </Select>
        </div>
        <div>
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button disabled={!sectionId || save.isPending} onClick={() => save.mutate()}>Save attendance</Button>
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
