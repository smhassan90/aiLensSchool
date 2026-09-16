"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageLoader } from "@/components/layout/page-loader";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { quizzesService } from "@/services/quizzes.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ExamPaperSubmissionPaper } from "@/services/academics.service";
import { examPaperLabel } from "@/lib/exam-paper";
import { difficultyColorClass, difficultyDescription, difficultyLabel } from "@/lib/difficulty";
import { formatDate } from "@/lib/utils";
import { FileText } from "lucide-react";

type SubmittedExamPapersListProps = {
  papers: ExamPaperSubmissionPaper[];
  isLoading?: boolean;
  detailBasePath?: string;
};

function reviewLabel(status?: string) {
  if (status === "PENDING_REVIEW") return "Pending approval";
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Rejected";
  return "Submitted";
}

export function SubmittedExamPapersList({
  papers,
  isLoading,
  detailBasePath = "/school/submitted-exam-papers",
}: SubmittedExamPapersListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const approve = useMutation({
    mutationFn: (id: string) => quizzesService.approvePaper(id),
    onSuccess: () => {
      toast({ title: "Paper approved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["school-exam-paper-submissions"] });
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
      queryClient.invalidateQueries({ queryKey: ["school-exam-paper-submissions"] });
    },
    onError: (err) =>
      toast({
        title: "Could not reject",
        description: err instanceof ApiClientError ? err.message : (err as Error).message,
        variant: "error",
      }),
  });

  if (isLoading) {
    return <PageLoader variant="panel" task="exams" />;
  }

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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Paper</TableHead>
          <TableHead>Teacher</TableHead>
          <TableHead>Class</TableHead>
          <TableHead>Difficulty</TableHead>
          <TableHead>Marks</TableHead>
          <TableHead>Submitted</TableHead>
          <TableHead>Review</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {papers.map((paper) => (
          <TableRow key={paper.id}>
            <TableCell className="font-medium">
              {paper.title}
              <p className="text-xs text-muted-foreground">
                {paper.examConfig?.name ?? examPaperLabel(paper.paperKind)}
              </p>
            </TableCell>
            <TableCell>{paper.teacherName ?? "—"}</TableCell>
            <TableCell>
              {paper.subject?.name ?? "—"}
              {paper.section?.grade?.name ? ` · ${paper.section.grade.name} ${paper.section.name}` : ` ${paper.section?.name ?? ""}`}
            </TableCell>
            <TableCell>
              {paper.difficulty ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${difficultyColorClass(paper.difficulty)}`}
                  title={difficultyDescription(paper.difficulty)}
                >
                  {difficultyLabel(paper.difficulty)}
                </span>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell>{paper.totalMarks ?? "—"}</TableCell>
            <TableCell>
              {paper.submittedAt ? (
                <span className="text-sm">{formatDate(paper.submittedAt)}</span>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell>
              <span className="text-sm">{reviewLabel((paper as { reviewStatus?: string }).reviewStatus)}</span>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-2">
                {(paper as { reviewStatus?: string }).reviewStatus === "PENDING_REVIEW" ? (
                  <>
                    <Button size="sm" onClick={() => approve.mutate(paper.id)} disabled={approve.isPending}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRejectId(paper.id)}>
                      Reject
                    </Button>
                  </>
                ) : null}
                <Link href={`${detailBasePath}/${paper.id}`}>
                  <Button size="sm" variant="outline">Print</Button>
                </Link>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>

    <Dialog open={Boolean(rejectId)} onOpenChange={(open) => !open && setRejectId(null)}>
      <DialogContent onClose={() => setRejectId(null)}>
        <DialogHeader>
          <DialogTitle>Reject exam paper</DialogTitle>
          <DialogDescription>
            Tell the teacher what to fix. They will see this note and can revise the paper.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reject-reason">Reason</Label>
          <Input
            id="reject-reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Section B marks do not match the total"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRejectId(null)}>Cancel</Button>
          <Button
            disabled={!rejectReason.trim() || reject.isPending}
            onClick={() => rejectId && reject.mutate({ id: rejectId, reason: rejectReason.trim() })}
          >
            Reject paper
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
