"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { academicsService } from "@/services/academics.service";
import type { Subject, Teacher } from "@/lib/types";
import { gradeClassLabel } from "@/lib/utils";
import { ApiClientError } from "@/lib/api-client";
import { useToast } from "@/providers/toast-provider";
import { BookOpen, Plus, UserMinus } from "lucide-react";
import Link from "next/link";
import { uniqueSubjectsForPicker } from "@/lib/unique-subjects";

const assignSchema = z.object({
  academicYearId: z.string().min(1, "Select year"),
  gradeId: z.string().min(1, "Select class"),
  sectionId: z.string().min(1, "Select section"),
  subjectId: z.string().min(1, "Select subject"),
});

type AssignValues = z.infer<typeof assignSchema>;

type AssignmentRow = {
  id: string;
  role: "Subject teacher" | "Assistant";
  sectionId: string;
  subjectId: string;
  academicYearId: string;
  branchId: string;
  classLabel: string;
  sectionName: string;
  subjectName: string;
  primaryTeacherId?: string | null;
};

function rowsFromTeacher(teacher: Teacher): AssignmentRow[] {
  const primary = (teacher.classSubjects ?? []).map((item) => ({
    id: item.id,
    role: "Subject teacher" as const,
    sectionId: item.sectionId ?? item.section?.id ?? "",
    subjectId: item.subjectId ?? item.subject?.id ?? "",
    academicYearId: item.academicYearId ?? item.academicYear?.id ?? "",
    branchId: item.branchId ?? teacher.branch?.id ?? "",
    classLabel: gradeClassLabel(item.section),
    sectionName: item.section?.name ?? "—",
    subjectName: item.subject?.name ?? "Subject",
  }));
  const assistant = (teacher.assistantClassSubjects ?? []).map((item) => {
    const withPrimary = item as typeof item & { teacherId?: string | null };
    return {
      id: `asst-${item.id}`,
      role: "Assistant" as const,
      sectionId: item.sectionId ?? item.section?.id ?? "",
      subjectId: item.subjectId ?? item.subject?.id ?? "",
      academicYearId: item.academicYearId ?? item.academicYear?.id ?? "",
      branchId: item.branchId ?? teacher.branch?.id ?? "",
      classLabel: gradeClassLabel(item.section),
      sectionName: item.section?.name ?? "—",
      subjectName: item.subject?.name ?? "Subject",
      primaryTeacherId: withPrimary.teacherId,
    };
  });
  return [...primary, ...assistant].filter((row) => row.sectionId && row.subjectId);
}

export function TeacherSubjectAssignmentsPanel({
  teacher,
  teacherId,
  canManage,
}: {
  teacher: Teacher;
  teacherId: string;
  canManage: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [pendingAssign, setPendingAssign] = useState<AssignValues | null>(null);
  const [pendingUnassign, setPendingUnassign] = useState<AssignmentRow | null>(null);
  const rows = useMemo(() => rowsFromTeacher(teacher), [teacher]);

  const years = useQuery({
    queryKey: ["academic-years"],
    queryFn: () => academicsService.listYears({ limit: 20 }),
    enabled: canManage && assignOpen,
  });
  const grades = useQuery({
    queryKey: ["grades"],
    queryFn: () => academicsService.listGrades({ limit: 100 }),
    enabled: canManage && assignOpen,
  });

  const form = useForm<AssignValues>({ resolver: zodResolver(assignSchema) });
  const gradeId = form.watch("gradeId");
  const sectionId = form.watch("sectionId");
  const academicYearId = form.watch("academicYearId");
  const sections = useQuery({
    queryKey: ["sections", gradeId],
    queryFn: () => academicsService.listSections({ gradeId, limit: 50 }),
    enabled: canManage && assignOpen && Boolean(gradeId),
  });
  const sectionItems = sections.data?.items ?? [];
  const singleSection = sectionItems.length === 1 ? sectionItems[0] : null;

  useEffect(() => {
    if (!assignOpen || !gradeId || !singleSection) return;
    if (form.getValues("sectionId") !== singleSection.id) {
      form.setValue("sectionId", singleSection.id);
    }
  }, [assignOpen, gradeId, singleSection, form]);

  const subjects = useQuery({
    queryKey: ["subjects", gradeId],
    queryFn: () => academicsService.listSubjects({ gradeId, limit: 100 }),
    enabled: canManage && assignOpen && Boolean(gradeId),
  });
  const sectionClassSubjects = useQuery({
    queryKey: ["class-subjects", "assign-picker", sectionId, academicYearId],
    queryFn: () =>
      academicsService.listClassSubjects({
        sectionId,
        academicYearId,
        limit: 100,
      }),
    enabled: canManage && assignOpen && Boolean(sectionId) && Boolean(academicYearId),
  });

  const subjectOptions = useMemo(() => {
    const fromSection: Subject[] = (sectionClassSubjects.data?.items ?? [])
      .map((row) => row.subject)
      .filter((s): s is Subject => Boolean(s));
    if (fromSection.length) {
      return uniqueSubjectsForPicker(fromSection, gradeId);
    }
    return uniqueSubjectsForPicker(subjects.data?.items ?? [], gradeId);
  }, [sectionClassSubjects.data?.items, subjects.data?.items, gradeId]);

  const currentYear =
    years.data?.items.find((y) => y.isCurrent) ?? years.data?.items[0];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["teacher", teacherId] });
    queryClient.invalidateQueries({ queryKey: ["teachers"] });
    queryClient.invalidateQueries({ queryKey: ["class-subjects"] });
    queryClient.invalidateQueries({ queryKey: ["teaching-assignments"] });
  };

  const assign = useMutation({
    mutationFn: (values: AssignValues) => {
      const section = sections.data?.items.find((s) => s.id === values.sectionId);
      return academicsService.assignClassSubject({
        sectionId: values.sectionId,
        subjectId: values.subjectId,
        academicYearId: values.academicYearId,
        branchId: section?.branchId ?? teacher.branch?.id ?? "",
        teacherId,
      });
    },
    onSuccess: () => {
      toast({
        title: "Subject assigned",
        description: "The teacher is now linked to this class and subject.",
        variant: "success",
      });
      invalidate();
      setAssignOpen(false);
      setPendingAssign(null);
      form.reset();
    },
    onError: (err) =>
      toast({
        title: "Could not assign subject",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      }),
  });

  const unassign = useMutation({
    mutationFn: (row: AssignmentRow) => {
      if (row.role === "Assistant") {
        return academicsService.assignClassSubject({
          sectionId: row.sectionId,
          subjectId: row.subjectId,
          academicYearId: row.academicYearId,
          branchId: row.branchId,
          teacherId: row.primaryTeacherId ?? undefined,
          assistantTeacherId: null,
        });
      }
      return academicsService.assignClassSubject({
        sectionId: row.sectionId,
        subjectId: row.subjectId,
        academicYearId: row.academicYearId,
        branchId: row.branchId,
        teacherId: null,
      });
    },
    onSuccess: () => {
      setPendingUnassign(null);
      toast({
        title: "Subject unassigned",
        description: "This teacher is no longer linked to that class subject.",
        variant: "success",
      });
      invalidate();
    },
    onError: (err) =>
      toast({
        title: "Could not remove assignment",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      }),
  });

  const openAssign = () => {
    if (currentYear) {
      form.reset({
        academicYearId: currentYear.id,
        gradeId: "",
        sectionId: "",
        subjectId: "",
      });
    }
    setAssignOpen(true);
  };

  const homeroom = teacher.classSections ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Subjects & classes</CardTitle>
          <CardDescription>
            Assign or remove subjects for this teacher. Class-teacher (homeroom) roles are managed per
            section.
          </CardDescription>
        </div>
        {canManage ? (
          <Button type="button" size="sm" onClick={openAssign}>
            <Plus className="h-4 w-4" />
            Assign subject
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {homeroom.length ? (
          <div className="rounded-lg border border-dashed bg-muted/30 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Class teacher</p>
            <ul className="mt-2 space-y-1 text-sm">
              {homeroom.map((section) => (
                <li key={section.id}>
                  <Link href={`/school/classes/${section.id}`} className="font-medium hover:underline">
                    {gradeClassLabel(section)} · Section {section.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border py-8 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No subject assignments yet.</p>
            {canManage ? (
              <Button type="button" variant="outline" size="sm" onClick={openAssign}>
                Assign first subject
              </Button>
            ) : null}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Role</TableHead>
                {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.classLabel}</TableCell>
                  <TableCell>{row.sectionName}</TableCell>
                  <TableCell>{row.subjectName}</TableCell>
                  <TableCell>
                    <Badge variant={row.role === "Assistant" ? "secondary" : "success"}>{row.role}</Badge>
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={unassign.isPending}
                        onClick={() => setPendingUnassign(row)}
                      >
                        <UserMinus className="h-4 w-4" />
                        Remove
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <p className="text-xs text-muted-foreground">
          See all assignments across the school on{" "}
          <Link href="/school/teachers/teaching-assignments" className="font-medium text-primary hover:underline">
            Teaching assignments
          </Link>
          .
        </p>
      </CardContent>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent onClose={() => setAssignOpen(false)}>
          <DialogHeader>
            <DialogTitle>Assign subject</DialogTitle>
            <DialogDescription>Pick class, section, and subject for this teacher.</DialogDescription>
          </DialogHeader>
          <form
            className="mt-4 space-y-4"
            onSubmit={form.handleSubmit((values) => setPendingAssign(values))}
          >
            <div className="space-y-2">
              <Label htmlFor="academicYearId">Academic year</Label>
              <Select id="academicYearId" {...form.register("academicYearId")}>
                <option value="">Select year</option>
                {(years.data?.items ?? []).map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gradeId">Class</Label>
              <Select
                id="gradeId"
                {...form.register("gradeId", {
                  onChange: (event) => {
                    const nextGradeId = event.target.value;
                    form.setValue("gradeId", nextGradeId);
                    form.setValue("sectionId", "");
                    form.setValue("subjectId", "");
                  },
                })}
              >
                <option value="">Select class</option>
                {(grades.data?.items ?? []).map((grade) => (
                  <option key={grade.id} value={grade.id}>
                    {grade.name}
                  </option>
                ))}
              </Select>
            </div>
            {singleSection ? (
              <>
                <input type="hidden" {...form.register("sectionId")} />
                <p className="text-sm text-muted-foreground">
                  Section{" "}
                  <span className="font-medium text-foreground">{singleSection.name}</span> is selected
                  automatically — this class has only one section.
                </p>
              </>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="sectionId">Section</Label>
                <Select
                  id="sectionId"
                  {...form.register("sectionId", {
                    onChange: () => form.setValue("subjectId", ""),
                  })}
                  disabled={!gradeId}
                >
                  <option value="">Select section</option>
                  {sectionItems.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="subjectId">Subject</Label>
              <Select
                id="subjectId"
                {...form.register("subjectId")}
                disabled={!gradeId || (!singleSection && !sectionId)}
              >
                <option value="">Select subject</option>
                {subjectOptions.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                    {subject.code ? ` (${subject.code})` : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAssignOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={assign.isPending}>
                {assign.isPending ? "Saving…" : "Assign"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingAssign)} onOpenChange={(open) => { if (!open) setPendingAssign(null); }}>
        <DialogContent onClose={() => setPendingAssign(null)}>
          <DialogHeader>
            <DialogTitle>Confirm assignment</DialogTitle>
            <DialogDescription>
              Assign this teacher to the selected class, section, and subject?
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPendingAssign(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={assign.isPending}
              onClick={() => pendingAssign && assign.mutate(pendingAssign)}
            >
              {assign.isPending ? "Assigning…" : "Confirm assign"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingUnassign)} onOpenChange={(open) => { if (!open) setPendingUnassign(null); }}>
        <DialogContent onClose={() => setPendingUnassign(null)}>
          <DialogHeader>
            <DialogTitle>Unassign subject?</DialogTitle>
            <DialogDescription>
              {pendingUnassign
                ? `Remove ${pendingUnassign.subjectName} (${pendingUnassign.classLabel} · Section ${pendingUnassign.sectionName}) from this teacher?`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPendingUnassign(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={unassign.isPending}
              onClick={() => pendingUnassign && unassign.mutate(pendingUnassign)}
            >
              {unassign.isPending ? "Removing…" : "Confirm unassign"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
