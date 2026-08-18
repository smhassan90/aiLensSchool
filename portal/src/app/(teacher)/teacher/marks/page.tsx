"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { academicsService } from "@/services/academics.service";
import { teachersService } from "@/services/teachers.service";
import { documentsService } from "@/services/documents.service";
import { useToast } from "@/providers/toast-provider";

export default function TeacherMarksPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [classKey, setClassKey] = useState("");
  const classes = useQuery({ queryKey: ["teacher-classes"], queryFn: () => teachersService.myClasses() });
  const selected = classes.data?.find((cls) => `${cls.sectionId}:${cls.subjectId}` === classKey);
  const enrollments = useQuery({
    queryKey: ["enrollments", selected?.sectionId],
    queryFn: () => academicsService.listEnrollments({ sectionId: selected?.sectionId, limit: 100 }),
    enabled: Boolean(selected?.sectionId),
  });
  const marks = useQuery({
    queryKey: ["assessments", selected?.sectionId, selected?.subjectId],
    queryFn: () => academicsService.listAssessments({ sectionId: selected?.sectionId, subjectId: selected?.subjectId }),
    enabled: Boolean(selected?.sectionId),
  });

  const termLabel = useMemo(() => {
    if (!selected) return "Term";
    return `${selected.subjectName}`;
  }, [selected]);

  const save = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      if (!selected) throw new Error("Pick a class");
      const data = new FormData(form);
      return academicsService.addAssessment({
        studentId: String(data.get("studentId")),
        subjectId: selected.subjectId,
        sectionId: selected.sectionId,
        academicYearId: selected.academicYearId,
        type: String(data.get("type")),
        title: String(data.get("title")),
        maxMarks: Number(data.get("maxMarks") || 100),
        marks: Number(data.get("marks") || 0),
      });
    },
    onSuccess: () => {
      toast({ title: "Marks saved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["assessments"] });
    },
    onError: (err: Error) => toast({ title: "Could not save", description: err.message, variant: "error" }),
  });

  const report = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Pick a class");
      return documentsService.generateReportCards({
        academicYearId: selected.academicYearId,
        sectionId: selected.sectionId,
        subjectId: selected.subjectId,
        termLabel,
      });
    },
    onSuccess: (res) => toast({ title: `Report cards ready for ${res.generated} students`, variant: "success" }),
    onError: (err: Error) => toast({ title: "Could not generate", description: err.message, variant: "error" }),
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    save.mutate(e.currentTarget);
    e.currentTarget.reset();
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Marks & report cards"
        description="Enter a test or exam once. Then generate this subject’s report card."
        actions={
          <Button disabled={!selected || report.isPending} onClick={() => report.mutate()}>
            {report.isPending ? "Making cards…" : "Report card for this subject"}
          </Button>
        }
      />

      <div className="mb-6 max-w-md">
        <Label>Your class</Label>
        <select
          className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
          value={classKey}
          onChange={(e) => setClassKey(e.target.value)}
        >
          <option value="">Select</option>
          {(classes.data ?? []).map((cls) => (
            <option key={`${cls.sectionId}-${cls.subjectId}`} value={`${cls.sectionId}:${cls.subjectId}`}>
              {cls.gradeName} {cls.sectionName} · {cls.subjectName}
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Add marks</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-3">
                <select name="studentId" required className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="">Student</option>
                  {(enrollments.data?.items ?? []).map((row) => (
                    <option key={row.studentId} value={row.studentId}>
                      {row.student ? `${row.student.firstName} ${row.student.lastName}` : row.studentId}
                    </option>
                  ))}
                </select>
                <select name="type" className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="CLASS_TEST">Class test</option>
                  <option value="PHYSICAL_TEST">Physical test</option>
                  <option value="TERM_EXAM">Term exam</option>
                </select>
                <Input name="title" required placeholder="Unit 3 test" />
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Got</Label><Input name="marks" type="number" min={0} required /></div>
                  <div><Label>Out of</Label><Input name="maxMarks" type="number" min={1} defaultValue={100} /></div>
                </div>
                <Button type="submit">Save marks</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Recently entered</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {(marks.data ?? []).map((row) => (
                <p key={row.id} className="rounded-md border px-3 py-2">
                  {row.student ? `${row.student.firstName} ${row.student.lastName}` : "Student"} · {row.title} · {Number(row.marks)}/{Number(row.maxMarks)}
                </p>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
