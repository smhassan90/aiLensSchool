"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExamPrintView } from "@/components/exams/exam-print-view";
import { ExamSolutionSheet } from "@/components/exams/exam-solution-sheet";
import { RejectExamPaperDialog } from "@/components/exams/reject-exam-paper-dialog";
import { ExamDateDialog } from "@/components/exams/exam-date-dialog";
import { quizzesService } from "@/services/quizzes.service";
import { academicsService } from "@/services/academics.service";
import {
  canPrintTeacherExamPaper,
  examPaperLabel,
  isExamPaper,
  teacherExamPaperStatus,
  teacherExamPaperStatusLabel,
  teacherExamPaperStatusVariant,
} from "@/lib/exam-paper";
import { difficultyColorClass, difficultyDescription, difficultyLabel } from "@/lib/difficulty";
import { personFullName } from "@/lib/person-name";
import { formatDate, localDateISO } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";

export function ExamPaperPrintScreen({
  quizId,
  listHref,
  canReview = false,
  submissionsQueryKey = "school-exam-paper-submissions",
}: {
  quizId: string;
  listHref: string;
  canReview?: boolean;
  submissionsQueryKey?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [printSolution, setPrintSolution] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [examDateOpen, setExamDateOpen] = useState(false);
  const [examDate, setExamDate] = useState(localDateISO());
  const [pendingPrintSolution, setPendingPrintSolution] = useState<boolean | null>(null);

  const paper = useQuery({
    queryKey: ["quiz", quizId],
    queryFn: () => quizzesService.getById(quizId),
    enabled: Boolean(quizId),
  });

  useEffect(() => {
    const reset = () => setPrintSolution(false);
    window.addEventListener("afterprint", reset);
    return () => window.removeEventListener("afterprint", reset);
  }, []);

  const approve = useMutation({
    mutationFn: () => quizzesService.approvePaper(quizId),
    onSuccess: () => {
      toast({ title: "Paper approved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["quiz", quizId] });
      queryClient.invalidateQueries({ queryKey: [submissionsQueryKey] });
    },
    onError: (err) =>
      toast({
        title: "Could not approve",
        description: err instanceof ApiClientError ? err.message : (err as Error).message,
        variant: "error",
      }),
  });

  const reject = useMutation({
    mutationFn: () => quizzesService.rejectPaper(quizId, rejectReason.trim()),
    onSuccess: () => {
      toast({ title: "Paper rejected", description: "The teacher can revise and resubmit.", variant: "success" });
      setRejectOpen(false);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["quiz", quizId] });
      queryClient.invalidateQueries({ queryKey: [submissionsQueryKey] });
    },
    onError: (err) =>
      toast({
        title: "Could not reject",
        description: err instanceof ApiClientError ? err.message : (err as Error).message,
        variant: "error",
      }),
  });

  const saveExamDate = useMutation({
    mutationFn: (date: string) => {
      const examConfigId = paper.data?.examConfigId ?? paper.data?.examConfig?.id;
      if (!examConfigId) throw new Error("Exam not linked to this paper");
      return academicsService.setExamConfigDate(examConfigId, date);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["quiz", quizId] });
      setExamDateOpen(false);
      if (pendingPrintSolution != null) {
        runPrint(pendingPrintSolution);
        setPendingPrintSolution(null);
      }
    },
    onError: (err) =>
      toast({
        title: "Could not save exam date",
        description: err instanceof ApiClientError ? err.message : (err as Error).message,
        variant: "error",
      }),
  });

  const runPrint = (solution: boolean) => {
    setPrintSolution(solution);
    requestAnimationFrame(() => window.print());
  };

  const handlePrint = (solution: boolean) => {
    const quiz = paper.data;
    if (!quiz) return;
    const hasExamDate = Boolean(quiz.examConfig?.startDate);
    if (!hasExamDate) {
      setPendingPrintSolution(solution);
      setExamDateOpen(true);
      return;
    }
    runPrint(solution);
  };

  if (paper.isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader title="Exam paper" />
        <PageLoader variant="page" task="exam" />
      </div>
    );
  }

  const quiz = paper.data;
  if (!quiz || !isExamPaper(quiz.paperKind)) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <EmptyState
          title="Paper not found"
          action={
            <Link href={listHref}>
              <Button variant="outline">Back to papers</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const status = teacherExamPaperStatus(quiz);
  const canPrint = canPrintTeacherExamPaper(quiz);
  const isPending = quiz.reviewStatus === "PENDING_REVIEW";

  return (
    <div className="p-4 sm:p-6 lg:p-8 print:p-0">
      <div className="print:hidden">
        <PageHeader
          title={quiz.title}
          description={`${examPaperLabel(quiz.paperKind)} · ${quiz.subject?.name ?? ""} ${quiz.section?.name ?? ""}`}
          actions={
            <div className="flex flex-wrap gap-2">
              <Link href={listHref}>
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              </Link>
              {canReview && isPending ? (
                <>
                  <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
                    Approve
                  </Button>
                  <Button variant="outline" onClick={() => setRejectOpen(true)}>
                    Reject
                  </Button>
                </>
              ) : null}
              {canPrint ? (
                <>
                  <Button variant="outline" onClick={() => handlePrint(false)}>
                    <Printer className="h-4 w-4" />
                    Print paper
                  </Button>
                  <Button onClick={() => handlePrint(true)}>
                    <Printer className="h-4 w-4" />
                    Print answer key
                  </Button>
                </>
              ) : null}
            </div>
          }
        />
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Badge variant={teacherExamPaperStatusVariant(status)}>
            {teacherExamPaperStatusLabel(status)}
          </Badge>
          {quiz.examConfig?.startDate ? (
            <span className="text-sm text-muted-foreground">
              Exam date: {formatDate(quiz.examConfig.startDate)}
            </span>
          ) : (
            <span className="text-sm text-amber-800">Exam date not set — required before printing</span>
          )}
          {quiz.difficulty ? (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${difficultyColorClass(quiz.difficulty)}`}
            >
              Difficulty {difficultyLabel(quiz.difficulty)} · {difficultyDescription(quiz.difficulty)}
            </span>
          ) : null}
          {quiz.createdBy ? (
            <span className="text-sm text-muted-foreground">
              {personFullName(quiz.createdBy.firstName, quiz.createdBy.lastName)}
            </span>
          ) : null}
        </div>
        {canReview && isPending ? (
          <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            This paper is waiting for your approval. Review it below, then approve or reject with feedback for the teacher.
          </p>
        ) : null}
        {!canPrint && (!isPending || !canReview) ? (
          <p className="mb-6 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {canReview
              ? "Printing is available after you approve the paper."
              : "Printing is available after the head teacher approves this paper."}
          </p>
        ) : null}
      </div>
      {printSolution ? <ExamSolutionSheet quiz={quiz} /> : <ExamPrintView quiz={quiz} showAnswers={false} />}
      <style>{`
        @media print {
          nav, aside { display: none !important; }
          html, body, #__next, main {
            height: auto !important;
            overflow: visible !important;
          }
        }
      `}</style>

      {canReview ? (
        <RejectExamPaperDialog
          open={rejectOpen}
          onOpenChange={setRejectOpen}
          reason={rejectReason}
          onReasonChange={setRejectReason}
          onConfirm={() => reject.mutate()}
          isPending={reject.isPending}
          paperTitle={quiz.title}
        />
      ) : null}

      <ExamDateDialog
        open={examDateOpen}
        onOpenChange={(open) => {
          setExamDateOpen(open);
          if (!open) setPendingPrintSolution(null);
        }}
        examDate={examDate}
        onExamDateChange={setExamDate}
        onConfirm={() => saveExamDate.mutate(examDate)}
        isPending={saveExamDate.isPending}
        examName={quiz.examConfig?.name ?? quiz.title}
      />
    </div>
  );
}
