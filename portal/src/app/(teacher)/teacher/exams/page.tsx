"use client";

import { useState } from "react";
import { ExamDeadlineRequestDialog } from "@/components/exams/exam-deadline-request-dialog";
import type { TeacherExamAssignment } from "@/components/exams/teacher-exam-assignments";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { GenerateExamPaperDialog } from "@/components/exams/generate-exam-paper-dialog";
import { TeacherExamAssignments } from "@/components/exams/teacher-exam-assignments";
import { lessonsService } from "@/services/lessons.service";
import { teachersService } from "@/services/teachers.service";
import { academicsService } from "@/services/academics.service";
import { quizzesService } from "@/services/quizzes.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { buildQuestionSpecForMarks } from "@/lib/exam-paper-question-spec";

const schema = z
  .object({
    examConfigId: z.string().optional(),
    classKey: z.string().optional(),
    difficulty: z.coerce.number().min(1).max(10),
    lessonIds: z.array(z.string()).min(1, "Select at least one lecture"),
    mcqCount: z.coerce.number().min(0).max(20),
    fillBlankCount: z.coerce.number().min(0).max(20),
    trueFalseCount: z.coerce.number().min(0).max(20),
    shortAnswerCount: z.coerce.number().min(0).max(20),
    longAnswerCount: z.coerce.number().min(0).max(20),
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
    if (value.shortAnswerCount + value.longAnswerCount > 20) {
      ctx.addIssue({
        code: "custom",
        path: ["shortAnswerCount"],
        message: "Short and long questions together cannot exceed 20",
      });
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

export default function TeacherExamsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const [extensionOpen, setExtensionOpen] = useState(false);
  const [extensionAssignment, setExtensionAssignment] = useState<TeacherExamAssignment | null>(null);
  const [extensionDays, setExtensionDays] = useState<"1" | "2" | "3">("1");
  const [scoreExtensionOpen, setScoreExtensionOpen] = useState(false);
  const [scoreExtensionAssignment, setScoreExtensionAssignment] = useState<TeacherExamAssignment | null>(null);
  const [scoreExtensionDays, setScoreExtensionDays] = useState<"1" | "2" | "3">("1");

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

  const requestExtension = useMutation({
    mutationFn: () => {
      if (!extensionAssignment) throw new Error("No assignment selected");
      return academicsService.requestExamDeadlineExtension({
        assignmentId: extensionAssignment.id,
        kind: "paper",
        days: Number(extensionDays) as 1 | 2 | 3,
      });
    },
    onSuccess: (res) => {
      toast({
        title: "Request sent to office",
        description: `You asked for ${res.days} day${res.days === 1 ? "" : "s"} for ${res.examName} · ${res.className}.`,
        variant: "success",
      });
      setExtensionOpen(false);
      setExtensionAssignment(null);
      queryClient.invalidateQueries({ queryKey: ["my-exam-paper-assignments"] });
    },
    onError: (err) => {
      toast({
        title: "Could not send request",
        description: err instanceof ApiClientError ? err.message : (err as Error).message,
        variant: "error",
      });
    },
  });

  const requestScoreExtension = useMutation({
    mutationFn: () => {
      if (!scoreExtensionAssignment) throw new Error("No assignment selected");
      return academicsService.requestExamDeadlineExtension({
        assignmentId: scoreExtensionAssignment.id,
        kind: "score",
        days: Number(scoreExtensionDays) as 1 | 2 | 3,
      });
    },
    onSuccess: (res) => {
      toast({
        title: "Score entry request sent",
        description: `You asked for ${res.days} day${res.days === 1 ? "" : "s"} for ${res.examName} · ${res.className}.`,
        variant: "success",
      });
      setScoreExtensionOpen(false);
      setScoreExtensionAssignment(null);
      queryClient.invalidateQueries({ queryKey: ["my-exam-paper-assignments"] });
    },
    onError: (err) => {
      toast({
        title: "Could not send request",
        description: err instanceof ApiClientError ? err.message : (err as Error).message,
        variant: "error",
      });
    },
  });

  const openForAssignment = (assignmentId: string) => {
    const row = assignments.data?.assignments.find((item) => item.id === assignmentId);
    if (!row) return;
    if (!row.paperSubmissionOpen && (row.status === "NOT_STARTED" || row.status === "DRAFT")) {
      setExtensionAssignment(row);
      setExtensionDays("1");
      setExtensionOpen(true);
      return;
    }
    if (row.quizId && row.status !== "NOT_STARTED") {
      window.location.assign(`/teacher/exams/${row.quizId}`);
      return;
    }
    const suggested = buildQuestionSpecForMarks(row.maxMarks);
    setActiveAssignmentId(assignmentId);
    form.reset({
      ...defaultValues,
      classKey: `${row.sectionId}:${row.subjectId}`,
      examConfigId: row.examConfigId,
      mcqCount: suggested.mcqCount,
      fillBlankCount: suggested.fillBlankCount,
      trueFalseCount: suggested.trueFalseCount,
      shortAnswerCount: suggested.shortAnswerCount,
      longAnswerCount: suggested.longAnswerCount,
      mcqMarks: suggested.mcqMarks,
      fillBlankMarks: suggested.fillBlankMarks,
      trueFalseMarks: suggested.trueFalseMarks,
      shortAnswerMarks: suggested.shortAnswerMarks,
      longAnswerMarks: suggested.longAnswerMarks,
    });
    setOpen(true);
  };

  const openScoreEntry = (assignmentId: string) => {
    const row = assignments.data?.assignments.find((item) => item.id === assignmentId);
    if (!row) return;
    if (row.scoreEntryOpen) {
      window.location.assign(`/teacher/marks/exam?exam=${row.examConfigId}&class=${row.sectionId}:${row.subjectId}`);
      return;
    }
    setScoreExtensionAssignment(row);
    setScoreExtensionDays("1");
    setScoreExtensionOpen(true);
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

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Exam papers"
        description="Papers are grouped by exam and sorted by class. Draft papers stay with you; after submit they go to the office for approval."
      />

      <TeacherExamAssignments
        assignments={assignments.data?.assignments ?? []}
        isLoading={assignments.isLoading}
        onGenerate={openForAssignment}
        onScoreEntry={openScoreEntry}
      />

      <ExamDeadlineRequestDialog
        open={extensionOpen}
        onOpenChange={(next) => {
          setExtensionOpen(next);
          if (!next) setExtensionAssignment(null);
        }}
        title="Paper submission deadline has passed"
        description={`${extensionAssignment?.examName ?? "Exam"} · ${extensionAssignment?.className ?? ""} · ${extensionAssignment?.subjectName ?? ""}`}
        dueDate={extensionAssignment?.submissionDueAt}
        days={extensionDays}
        onDaysChange={setExtensionDays}
        onConfirm={() => requestExtension.mutate()}
        isPending={requestExtension.isPending}
        pendingRequest={extensionAssignment?.paperExtensionRequest}
        kind="paper"
      />

      <ExamDeadlineRequestDialog
        open={scoreExtensionOpen}
        onOpenChange={(next) => {
          setScoreExtensionOpen(next);
          if (!next) setScoreExtensionAssignment(null);
        }}
        title={scoreExtensionAssignment?.scoresSubmitted ? "Submitted scores are locked" : "Score entry deadline has passed"}
        description={`${scoreExtensionAssignment?.examName ?? "Exam"} · ${scoreExtensionAssignment?.className ?? ""} · ${scoreExtensionAssignment?.subjectName ?? ""}`}
        dueDate={scoreExtensionAssignment?.scoreEntryDueAt}
        days={scoreExtensionDays}
        onDaysChange={setScoreExtensionDays}
        onConfirm={() => requestScoreExtension.mutate()}
        isPending={requestScoreExtension.isPending}
        pendingRequest={scoreExtensionAssignment?.scoreExtensionRequest}
        kind="score"
      />

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
