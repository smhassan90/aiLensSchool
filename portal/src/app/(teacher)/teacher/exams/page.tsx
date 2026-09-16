"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { EmptyState } from "@/components/layout/empty-state";
import { GenerateExamPaperDialog } from "@/components/exams/generate-exam-paper-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { quizzesService } from "@/services/quizzes.service";
import { lessonsService } from "@/services/lessons.service";
import { teachersService } from "@/services/teachers.service";
import { academicsService } from "@/services/academics.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { examPaperLabel, examStatusLabel } from "@/lib/exam-paper";
import { difficultyColorClass, difficultyLabel } from "@/lib/difficulty";
import { formatDate } from "@/lib/utils";
import { AlertTriangle, FileText, Plus } from "lucide-react";

const schema = z
  .object({
    examConfigId: z.string().optional(),
    classKey: z.string().optional(),
    difficulty: z.coerce.number().min(1).max(10),
    lessonIds: z.array(z.string()).min(1, "Select at least one lecture"),
    mcqCount: z.coerce.number().min(0).max(40),
    fillBlankCount: z.coerce.number().min(0).max(40),
    trueFalseCount: z.coerce.number().min(0).max(40),
    shortAnswerCount: z.coerce.number().min(0).max(40),
    longAnswerCount: z.coerce.number().min(0).max(40),
    mcqMarks: z.coerce.number().min(0).max(200),
    fillBlankMarks: z.coerce.number().min(0).max(200),
    trueFalseMarks: z.coerce.number().min(0).max(200),
    shortAnswerMarks: z.coerce.number().min(0).max(200),
    longAnswerMarks: z.coerce.number().min(0).max(200),
  })
  .superRefine((value, ctx) => {
    const totalQuestions =
      value.mcqCount + value.fillBlankCount + value.trueFalseCount + value.shortAnswerCount + value.longAnswerCount;
    if (totalQuestions < 1) {
      ctx.addIssue({ code: "custom", path: ["mcqCount"], message: "Add at least one question" });
    }
  });

type FormValues = z.infer<typeof schema>;

const defaultValues: FormValues = {
  examConfigId: "",
  classKey: "",
  difficulty: 3,
  lessonIds: [],
  mcqCount: 8,
  fillBlankCount: 3,
  trueFalseCount: 5,
  shortAnswerCount: 3,
  longAnswerCount: 1,
  mcqMarks: 16,
  fillBlankMarks: 6,
  trueFalseMarks: 5,
  shortAnswerMarks: 12,
  longAnswerMarks: 8,
};

function assignmentStatusLabel(status: string) {
  if (status === "NOT_STARTED") return "Not started";
  if (status === "DRAFT") return "Draft";
  if (status === "REJECTED") return "Rejected — revise";
  if (status === "PENDING_REVIEW") return "Submitted";
  if (status === "APPROVED") return "Approved";
  return status;
}

export default function TeacherExamsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);

  const papers = useQuery({
    queryKey: ["teacher-exam-papers"],
    queryFn: () => quizzesService.list({ limit: 50, paperKind: "EXAM" }),
  });
  const assignments = useQuery({
    queryKey: ["my-exam-paper-assignments"],
    queryFn: () => academicsService.listMyExamPaperAssignments(),
  });
  const classes = useQuery({
    queryKey: ["teacher-classes"],
    queryFn: () => teachersService.myClasses(),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const activeAssignment = assignments.data?.assignments.find((row) => row.id === activeAssignmentId);
  const classKey = activeAssignment
    ? `${activeAssignment.sectionId}:${activeAssignment.subjectId}`
    : form.watch("classKey");
  const selectedClass = classes.data?.find((row) => `${row.sectionId}:${row.subjectId}` === classKey);

  const lectures = useQuery({
    queryKey: ["exam-lectures", selectedClass?.sectionId, selectedClass?.subjectId],
    queryFn: () =>
      lessonsService.list({
        sectionId: selectedClass?.sectionId,
        subjectId: selectedClass?.subjectId,
        status: "CONFIRMED",
        limit: 100,
      }),
    enabled: Boolean(selectedClass),
  });

  const selectedLessonIds = form.watch("lessonIds") ?? [];

  const generate = useMutation({
    mutationFn: (values: FormValues) => {
      const assignment = assignments.data?.assignments.find((row) => row.id === activeAssignmentId);
      const cls = assignment
        ? classes.data?.find(
            (row) => row.sectionId === assignment.sectionId && row.subjectId === assignment.subjectId,
          )
        : classes.data?.find((row) => `${row.sectionId}:${row.subjectId}` === values.classKey);
      if (!cls) throw new Error("Class not found");
      if (!assignment) throw new Error("This exam was not assigned to you yet");

      const totalMarks =
        values.mcqMarks +
        values.fillBlankMarks +
        values.trueFalseMarks +
        values.shortAnswerMarks +
        values.longAnswerMarks;
      if (totalMarks !== assignment.maxMarks) {
        throw new Error(`Section marks must add up to exactly ${assignment.maxMarks}.`);
      }

      return quizzesService.generate({
        academicYearId: cls.academicYearId,
        sectionId: cls.sectionId,
        subjectId: cls.subjectId,
        branchId: cls.branchId,
        lessonIds: values.lessonIds,
        examConfigId: assignment.examConfigId,
        examPaperAssignmentId: assignment.id,
        paperKind: assignment.examName.toLowerCase().includes("final")
          ? "FINAL_TERM"
          : assignment.examName.toLowerCase().includes("mid")
            ? "MID_TERM"
            : "ASSESSMENT",
        difficulty: values.difficulty,
        quickGenerate: false,
        mcqCount: values.mcqCount,
        fillBlankCount: values.fillBlankCount,
        trueFalseCount: values.trueFalseCount,
        shortAnswerCount: values.shortAnswerCount,
        longAnswerCount: values.longAnswerCount,
        mcqMarks: values.mcqMarks,
        fillBlankMarks: values.fillBlankMarks,
        trueFalseMarks: values.trueFalseMarks,
        shortAnswerMarks: values.shortAnswerMarks,
        longAnswerMarks: values.longAnswerMarks,
      });
    },
    onSuccess: (paper) => {
      toast({ title: "Paper generated", description: "Review it, then submit for approval.", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["teacher-exam-papers"] });
      queryClient.invalidateQueries({ queryKey: ["my-exam-paper-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-dashboard"] });
      setOpen(false);
      setActiveAssignmentId(null);
      form.reset(defaultValues);
      window.location.href = `/teacher/exams/${paper.id}`;
    },
    onError: (err) => {
      toast({
        title: "Could not generate paper",
        description: err instanceof ApiClientError ? err.message : (err as Error).message,
        variant: "error",
      });
    },
  });

  const openForAssignment = (assignmentId: string) => {
    const row = assignments.data?.assignments.find((item) => item.id === assignmentId);
    if (!row) return;
    setActiveAssignmentId(assignmentId);
    form.reset({
      ...defaultValues,
      classKey: `${row.sectionId}:${row.subjectId}`,
      examConfigId: row.examConfigId,
    });
    setOpen(true);
  };

  const toggleLesson = (id: string) => {
    const next = selectedLessonIds.includes(id)
      ? selectedLessonIds.filter((item) => item !== id)
      : [...selectedLessonIds, id];
    form.setValue("lessonIds", next, { shouldValidate: true });
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setActiveAssignmentId(null);
      form.reset(defaultValues);
    }
  };

  const pendingAssignments = (assignments.data?.assignments ?? []).filter((row) => row.pendingGeneration);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Exam papers"
        description="The office assigns exams with marks and due dates. Generate only when an assignment appears below."
      />

      {assignments.isLoading ? (
        <PageLoader variant="panel" task="exams" />
      ) : pendingAssignments.length ? (
        <div className="mb-6 space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">
              {pendingAssignments.length} exam paper{pendingAssignments.length === 1 ? "" : "s"} still to generate and submit
            </p>
          </div>
          <div className="grid gap-3">
            {pendingAssignments.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
                <div>
                  <p className="font-medium">{row.examName}</p>
                  <p className="text-sm text-muted-foreground">
                    {row.className} · {row.subjectName} · {row.maxMarks} marks · submit by {formatDate(row.submissionDueAt)}
                  </p>
                  {row.status === "REJECTED" && row.rejectionReason ? (
                    <p className="mt-1 text-sm text-amber-800">Office note: {row.rejectionReason}</p>
                  ) : null}
                </div>
                <Button onClick={() => (row.quizId ? window.location.assign(`/teacher/exams/${row.quizId}`) : openForAssignment(row.id))}>
                  {row.status === "DRAFT" || row.status === "REJECTED" ? "Continue draft" : "Generate paper"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mb-6 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          No pending exam assignments right now. The office will release papers when it is time to prepare them.
        </p>
      )}

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">All assignments</h2>
        <div className="rounded-lg border bg-card">
          {!assignments.data?.assignments.length ? (
            <EmptyState
              icon={<FileText className="h-10 w-10" />}
              title="No assignments yet"
              description="When the office releases an exam for your class, it will show up here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Marks</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.data.assignments.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.examName}</TableCell>
                    <TableCell>{row.className} · {row.subjectName}</TableCell>
                    <TableCell>{formatDate(row.submissionDueAt)}</TableCell>
                    <TableCell>{row.maxMarks}</TableCell>
                    <TableCell>
                      <Badge variant={row.pendingGeneration ? "warning" : "success"}>
                        {assignmentStatusLabel(row.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.quizId ? (
                        <Link href={`/teacher/exams/${row.quizId}`}>
                          <Button size="sm" variant="outline">Open</Button>
                        </Link>
                      ) : row.pendingGeneration ? (
                        <Button size="sm" onClick={() => openForAssignment(row.id)}>Generate</Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Your papers</h2>
        <div className="rounded-lg border bg-card">
          {papers.isLoading ? (
            <PageLoader variant="panel" task="exams" />
          ) : !papers.data?.items.length ? (
            <EmptyState
              icon={<FileText className="h-10 w-10" />}
              title="No exam papers yet"
              description="Generate a paper from an assignment above when the office releases it."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paper</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Difficulty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Marks</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {papers.data.items.map((paper) => (
                  <TableRow key={paper.id}>
                    <TableCell className="font-medium">
                      {paper.title}
                      <p className="text-xs text-muted-foreground">{examPaperLabel(paper.paperKind)}</p>
                    </TableCell>
                    <TableCell>
                      {paper.subject?.name ?? "—"} {paper.section?.name ?? ""}
                    </TableCell>
                    <TableCell>
                      {paper.difficulty ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${difficultyColorClass(paper.difficulty)}`}>
                          {difficultyLabel(paper.difficulty)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={paper.status === "CLOSED" ? "success" : "warning"}>
                        {examStatusLabel(paper.status, paper.paperKind)}
                      </Badge>
                    </TableCell>
                    <TableCell>{paper.totalMarks ?? "—"}</TableCell>
                    <TableCell>
                      <Link href={`/teacher/exams/${paper.id}`}>
                        <Button size="sm" variant="outline">Open</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <GenerateExamPaperDialog
        open={open}
        onOpenChange={handleOpenChange}
        form={form}
        classes={classes.data ?? []}
        examConfigs={[]}
        examConfigsLoading={false}
        lectures={lectures.data?.items ?? []}
        lecturesLoading={lectures.isLoading}
        selectedClass={selectedClass}
        selectedLessonIds={selectedLessonIds}
        onToggleLesson={toggleLesson}
        onSubmit={(values) => generate.mutate(values)}
        isGenerating={generate.isPending}
        assignment={
          activeAssignment
            ? {
                id: activeAssignment.id,
                examName: activeAssignment.examName,
                className: activeAssignment.className,
                subjectName: activeAssignment.subjectName,
                maxMarks: activeAssignment.maxMarks,
                submissionDueAt: activeAssignment.submissionDueAt,
              }
            : null
        }
      />
    </div>
  );
}
