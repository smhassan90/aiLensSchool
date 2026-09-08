"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
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
  const [examConfigId, setExamConfigId] = useState("");
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
    enabled: Boolean(selected?.sectionId && selected?.subjectId),
  });
  const examConfigs = useQuery({
    queryKey: ["exam-configs", selected?.academicYearId],
    queryFn: () => academicsService.listExamConfigs(selected?.academicYearId),
    enabled: Boolean(selected?.academicYearId),
  });
  const selectedExam = examConfigs.data?.find((exam) => exam.id === examConfigId);
  const templates = useQuery({
    queryKey: ["report-card-templates", selected?.gradeId],
    queryFn: () => documentsService.listReportCardTemplates(selected?.gradeId),
    enabled: Boolean(selected?.gradeId),
  });
  const template = templates.data?.templates[0];
  const templateLines = (template?.lines ?? []).filter((line) => {
    const subject = selected?.subjectName.toLowerCase() ?? "";
    const match = line.matchSubject.toLowerCase();
    if (line.choiceGroup === "SCIENCE_GROUP") {
      return /computer|comp|biology|bio/.test(subject);
    }
    return subject.includes(match) || match.includes(subject.split(" ")[0] ?? "");
  });
  const paperMax = templateLines.find((line) => line.maxMarks != null)?.maxMarks ?? null;

  const termLabel = useMemo(() => {
    if (selectedExam) return selectedExam.name;
    if (examConfigs.data?.[0]) return examConfigs.data[0].name;
    if (!selected) return "Term";
    return `${selected.subjectName}`;
  }, [selected, selectedExam, examConfigs.data]);

  const save = useMutation({
    mutationFn: (payload: {
      studentId: string;
      type: string;
      title: string;
      maxMarks: number;
      marks: number;
      examConfigId?: string;
    }) => {
      if (!selected) throw new Error("Pick a class");
      if (!selected.subjectId) throw new Error("This class has no subject yet. Ask the school admin to add subjects.");
      if (!payload.studentId) throw new Error("Pick a student");
      return academicsService.addAssessment({
        studentId: payload.studentId,
        subjectId: selected.subjectId,
        sectionId: selected.sectionId,
        academicYearId: selected.academicYearId,
        examConfigId: payload.examConfigId,
        type: payload.type,
        title: payload.title,
        maxMarks: payload.maxMarks,
        marks: payload.marks,
      });
    },
    onSuccess: () => {
      toast({ title: "Marks saved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["assessments"] });
      setExamConfigId("");
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
    const form = e.currentTarget;
    const data = new FormData(form);
    const examId = String(data.get("examConfigId") || "");
    const exam = examConfigs.data?.find((item) => item.id === examId);
    save.mutate(
      {
        studentId: String(data.get("studentId") ?? ""),
        type: exam ? "TERM_EXAM" : String(data.get("type") || "CLASS_TEST"),
        title: String(data.get("title") || exam?.name || ""),
        maxMarks: Number(data.get("maxMarks") || paperMax || exam?.maxMarks || 100),
        marks: Number(data.get("marks") || 0),
        examConfigId: examId || undefined,
      },
      { onSuccess: () => form.reset() },
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Marks & report cards"
        description="Enter exam marks on the school paper. Generate the class progress report when the paper is complete."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/teacher/results">
              <Button variant="outline">Quiz scores</Button>
            </Link>
            <Button disabled={!selected || report.isPending} onClick={() => report.mutate()}>
              {report.isPending ? "Making cards…" : "Generate class report cards"}
            </Button>
          </div>
        }
      />

      <div className="mb-6 max-w-md">
        <Label>Your class</Label>
        <select
          className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
          value={classKey}
          onChange={(e) => {
            setClassKey(e.target.value);
            setExamConfigId("");
          }}
        >
          <option value="">
            {classes.isLoading
              ? "Loading classes…"
              : (classes.data?.length ?? 0) === 0
                ? "No class assigned yet"
                : "Select"}
          </option>
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
                  <option value="">
                    {enrollments.isLoading
                      ? "Loading students…"
                      : enrollments.isError
                        ? "Could not load students"
                        : (enrollments.data?.items?.length ?? 0) === 0
                          ? "No students enrolled in this class"
                          : "Student"}
                  </option>
                  {(enrollments.data?.items ?? []).map((row) => {
                    const studentId = row.student?.id ?? row.studentId;
                    if (!studentId) return null;
                    return (
                      <option key={studentId} value={studentId}>
                        {row.student ? `${row.student.firstName} ${row.student.lastName}` : studentId}
                      </option>
                    );
                  })}
                </select>
                <select
                  name="examConfigId"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={examConfigId}
                  onChange={(e) => setExamConfigId(e.target.value)}
                >
                  <option value="">Class test / other</option>
                  {(examConfigs.data ?? []).map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.name} (out of {exam.maxMarks})
                    </option>
                  ))}
                </select>
                {!examConfigId || templateLines.length > 1 ? (
                  <>
                    {!examConfigId && (
                      <select name="type" className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                        <option value="CLASS_TEST">Class test</option>
                        <option value="PHYSICAL_TEST">Physical test</option>
                        <option value="TERM_EXAM">Term exam</option>
                      </select>
                    )}
                    <Input
                      name="title"
                      required
                      placeholder={
                        templateLines.length > 1
                          ? templateLines.map((line) => line.label).join(" or ")
                          : "Unit 3 test"
                      }
                    />
                  </>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Got</Label><Input name="marks" type="number" min={0} required /></div>
                  <div>
                    <Label>Out of</Label>
                    <Input
                      key={`${examConfigId}-${paperMax ?? selectedExam?.maxMarks ?? 100}-${selected?.subjectId}`}
                      name="maxMarks"
                      type="number"
                      min={1}
                      defaultValue={paperMax ?? selectedExam?.maxMarks ?? 100}
                    />
                  </div>
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
