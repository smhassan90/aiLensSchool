"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, FileText, Printer, User } from "lucide-react";
import { PageLoader } from "@/components/layout/page-loader";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RejectExamPaperDialog } from "@/components/exams/reject-exam-paper-dialog";
import { quizzesService } from "@/services/quizzes.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import type { ExamPaperSubmissionPaper } from "@/services/academics.service";
import { examPaperLabel } from "@/lib/exam-paper";
import { difficultyColorClass, difficultyDescription, difficultyLabel } from "@/lib/difficulty";
import { formatDate, formatMarks } from "@/lib/utils";
import {
  teacherExamPaperStatusLabel,
  teacherExamPaperStatusVariant,
  type TeacherExamPaperStatus,
} from "@/lib/exam-paper";

type SubmittedExamPapersListProps = {
  papers: ExamPaperSubmissionPaper[];
  isLoading?: boolean;
  detailBasePath?: string;
  submissionsQueryKey?: string;
};

function reviewStatus(status?: string): TeacherExamPaperStatus {
  if (status === "APPROVED") return "APPROVED";
  if (status === "PENDING_REVIEW") return "PENDING";
  return "PENDING";
}

function PaperCard({
  paper,
  detailBasePath,
  onReject,
  onApprove,
  approvePending,
}: {
  paper: ExamPaperSubmissionPaper;
  detailBasePath: string;
  onReject: () => void;
  onApprove: () => void;
  approvePending: boolean;
}) {
  const status = reviewStatus(paper.reviewStatus);
  const isPending = paper.reviewStatus === "PENDING_REVIEW";
  const classLabel = paper.section?.grade?.name
    ? `${paper.section.grade.name} ${paper.section.name}`
    : paper.section?.name ?? "—";

  return (
    <article className="rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground">{paper.title}</h3>
            <Badge variant={teacherExamPaperStatusVariant(status)}>
              {teacherExamPaperStatusLabel(status)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {paper.examConfig?.name ?? examPaperLabel(paper.paperKind)}
          </p>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4 shrink-0" />
              {paper.teacherName ?? "—"}
            </p>
            <p className="text-muted-foreground">
              {paper.subject?.name ?? "—"} · {classLabel}
            </p>
            <p className="text-muted-foreground">
              {formatMarks(paper.totalMarks)} marks
              {paper.submittedAt ? ` · submitted ${formatDate(paper.submittedAt)}` : ""}
            </p>
            {paper.difficulty ? (
              <p>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${difficultyColorClass(paper.difficulty)}`}
                  title={difficultyDescription(paper.difficulty)}
                >
                  Difficulty {difficultyLabel(paper.difficulty)}
                </span>
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {isPending ? (
            <>
              <Button size="sm" onClick={onApprove} disabled={approvePending}>
                Approve
              </Button>
              <Button size="sm" variant="outline" onClick={onReject}>
                Reject
              </Button>
            </>
          ) : null}
          <Link href={`${detailBasePath}/${paper.id}`}>
            <Button size="sm" variant={paper.reviewStatus === "APPROVED" ? "default" : "outline"}>
              {paper.reviewStatus === "APPROVED" ? (
                <>
                  <Printer className="h-4 w-4" />
                  Print
                </>
              ) : (
                "Review"
              )}
            </Button>
          </Link>
        </div>
      </div>
    </article>
  );
}

export function SubmittedExamPapersList({
  papers,
  isLoading,
  detailBasePath = "/school/submitted-exam-papers",
  submissionsQueryKey = "school-exam-paper-submissions",
}: SubmittedExamPapersListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const approve = useMutation({
    mutationFn: (id: string) => quizzesService.approvePaper(id),
    onSuccess: () => {
      toast({ title: "Paper approved", variant: "success" });
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
    mutationFn: ({ id, reason }: { id: string; reason: string }) => quizzesService.rejectPaper(id, reason),
    onSuccess: () => {
      toast({ title: "Paper rejected", description: "The teacher can revise and resubmit.", variant: "success" });
      setRejectId(null);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: [submissionsQueryKey] });
    },
    onError: (err) =>
      toast({
        title: "Could not reject",
        description: err instanceof ApiClientError ? err.message : (err as Error).message,
        variant: "error",
      }),
  });

  if (isLoading) return <PageLoader variant="panel" task="exams" />;

  const pendingPapers = papers.filter((paper) => paper.reviewStatus === "PENDING_REVIEW");
  const otherPapers = papers.filter((paper) => paper.reviewStatus !== "PENDING_REVIEW");
  const rejectPaper = papers.find((paper) => paper.id === rejectId);

  if (!papers.length) {
    return (
      <EmptyState
        icon={<FileText className="h-10 w-10" />}
        title="No submitted papers match"
        description="Try another exam or clear the filters. Papers appear here after teachers submit them."
      />
    );
  }

  return (
    <>
      {pendingPapers.length ? (
        <section className="mb-8">
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3">
            <Clock className="h-5 w-5 text-amber-700" />
            <div>
              <h2 className="text-sm font-semibold text-amber-950">
                Waiting for your approval ({pendingPapers.length})
              </h2>
              <p className="text-xs text-amber-900/80">Review these papers first, then approve or reject with feedback.</p>
            </div>
          </div>
          <div className="grid gap-3">
            {pendingPapers.map((paper) => (
              <PaperCard
                key={paper.id}
                paper={paper}
                detailBasePath={detailBasePath}
                approvePending={approve.isPending}
                onApprove={() => approve.mutate(paper.id)}
                onReject={() => setRejectId(paper.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {otherPapers.length ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {pendingPapers.length ? "Other submitted papers" : "Submitted papers"}
          </h2>
          <div className="grid gap-3">
            {otherPapers.map((paper) => (
              <PaperCard
                key={paper.id}
                paper={paper}
                detailBasePath={detailBasePath}
                approvePending={approve.isPending}
                onApprove={() => approve.mutate(paper.id)}
                onReject={() => setRejectId(paper.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <RejectExamPaperDialog
        open={Boolean(rejectId)}
        onOpenChange={(open) => {
          if (!open) {
            setRejectId(null);
            setRejectReason("");
          }
        }}
        reason={rejectReason}
        onReasonChange={setRejectReason}
        isPending={reject.isPending}
        paperTitle={rejectPaper?.title}
        onConfirm={() => rejectId && reject.mutate({ id: rejectId, reason: rejectReason.trim() })}
      />
    </>
  );
}
