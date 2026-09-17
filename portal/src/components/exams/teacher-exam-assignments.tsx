"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, FileText, Pencil, Printer, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";
import { PageLoader } from "@/components/layout/page-loader";
import {
  teacherExamPaperStatusLabel,
  teacherExamPaperStatusVariant,
  type TeacherExamPaperStatus,
} from "@/lib/exam-paper";
import { formatDate } from "@/lib/utils";

export type TeacherExamAssignment = {
  id: string;
  examConfigId: string;
  examName: string;
  sectionId: string;
  subjectId: string;
  className: string;
  sectionName: string;
  gradeLevel: number;
  subjectName: string;
  maxMarks: number;
  submissionDueAt: string;
  scoreEntryDueAt: string | null;
  paperSubmissionOpen: boolean;
  scoreEntryOpen: boolean;
  scoresSubmitted: boolean;
  status: TeacherExamPaperStatus;
  quizId: string | null;
  rejectionReason: string | null;
  pendingGeneration: boolean;
  paperExtensionRequest: { id: string; days: number; status: "PENDING" } | null;
  scoreExtensionRequest: { id: string; days: number; status: "PENDING" } | null;
};

function statusIcon(status: TeacherExamPaperStatus) {
  if (status === "APPROVED") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "PENDING") return <Clock className="h-4 w-4 text-amber-600" />;
  if (status === "DRAFT") return <Pencil className="h-4 w-4 text-slate-600" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

function actionLabel(status: TeacherExamPaperStatus) {
  if (status === "NOT_STARTED") return "Generate paper";
  if (status === "DRAFT") return "Continue draft";
  if (status === "PENDING") return "View submission";
  return "Open & print";
}

type TeacherExamAssignmentsProps = {
  assignments: TeacherExamAssignment[];
  isLoading?: boolean;
  onGenerate: (assignmentId: string) => void;
  onScoreEntry: (assignmentId: string) => void;
};

export function TeacherExamAssignments({
  assignments,
  isLoading,
  onGenerate,
  onScoreEntry,
}: TeacherExamAssignmentsProps) {
  if (isLoading) return <PageLoader variant="panel" task="exams" />;

  if (!assignments.length) {
    return (
      <EmptyState
        icon={<FileText className="h-10 w-10" />}
        title="No exam assignments yet"
        description="When the office releases an exam for your classes, it will appear here grouped by exam."
      />
    );
  }

  const grouped = assignments.reduce<Record<string, TeacherExamAssignment[]>>((acc, row) => {
    acc[row.examName] = acc[row.examName] ?? [];
    acc[row.examName].push(row);
    return acc;
  }, {});

  const examNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
  const actionNeeded = assignments.filter(
    (row) => (row.status === "NOT_STARTED" || row.status === "DRAFT") && row.paperSubmissionOpen,
  ).length;
  const scoreDueSoon = assignments.filter(
    (row) => row.status === "APPROVED" && row.scoreEntryOpen && !row.scoresSubmitted && row.scoreEntryDueAt,
  );

  return (
    <div className="space-y-6">
      {actionNeeded > 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">
            {actionNeeded} paper{actionNeeded === 1 ? "" : "s"} still need your attention — submit before the due date shown below.
          </p>
        </div>
      ) : null}

      {scoreDueSoon.length > 0 ? (
        <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-950">
          <Trophy className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Enter student scores before the deadline</p>
            <ul className="mt-1 space-y-0.5 text-sky-900/90">
              {scoreDueSoon.slice(0, 3).map((row) => (
                <li key={row.id}>
                  {row.className} · {row.subjectName} — enter by {formatDate(row.scoreEntryDueAt!)}
                </li>
              ))}
            </ul>
            <Link href="/teacher/marks/exam" className="mt-2 inline-block font-medium underline">
              Open score entry grid
            </Link>
          </div>
        </div>
      ) : null}

      {examNames.map((examName) => {
        const rows = grouped[examName];
        return (
          <section key={examName} className="overflow-hidden rounded-xl border bg-card">
            <div className="border-b bg-muted/30 px-4 py-3 sm:px-5">
              <h2 className="text-base font-semibold text-foreground">{examName}</h2>
              <p className="text-sm text-muted-foreground">
                {rows.length} class{rows.length === 1 ? "" : "es"} · sorted by class number
              </p>
            </div>
            <div className="divide-y">
              {rows.map((row) => {
                const paperClosed =
                  !row.paperSubmissionOpen &&
                  (row.status === "NOT_STARTED" || row.status === "DRAFT");
                const scoreClosed =
                  row.status === "APPROVED" && !row.scoreEntryOpen && !row.scoresSubmitted;

                return (
                  <div
                    key={row.id}
                    className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{row.className}</p>
                        <Badge variant={teacherExamPaperStatusVariant(row.status)}>
                          <span className="inline-flex items-center gap-1">
                            {statusIcon(row.status)}
                            {teacherExamPaperStatusLabel(row.status)}
                          </span>
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {row.subjectName} · {row.maxMarks} marks · paper due {formatDate(row.submissionDueAt)}
                        {row.scoreEntryDueAt ? ` · scores due ${formatDate(row.scoreEntryDueAt)}` : ""}
                      </p>
                      {paperClosed && row.paperExtensionRequest ? (
                        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                          Extension request pending — you asked for {row.paperExtensionRequest.days} day
                          {row.paperExtensionRequest.days === 1 ? "" : "s"}. The office will review it soon.
                        </p>
                      ) : paperClosed ? (
                        <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950">
                          Paper submission deadline has passed. Click Generate paper to request an extension from the office.
                        </p>
                      ) : null}
                      {row.status === "DRAFT" && row.rejectionReason ? (
                        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                          Office feedback: {row.rejectionReason}
                        </p>
                      ) : null}
                      {row.status === "PENDING" ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          With the office for approval — you cannot edit until they respond.
                        </p>
                      ) : null}
                      {row.status === "APPROVED" ? (
                        <p className="mt-1 text-xs text-emerald-800">
                          Approved — you can print the paper for your class.
                          {row.scoreEntryDueAt && row.scoreEntryOpen
                            ? ` Enter scores by ${formatDate(row.scoreEntryDueAt)}.`
                            : ""}
                        </p>
                      ) : null}
                      {row.status === "APPROVED" && row.scoresSubmitted ? (
                        <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
                          Scores submitted and locked. Request the admin to reopen score entry to make corrections.
                        </p>
                      ) : null}
                      {scoreClosed ? (
                        <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950">
                          Score entry is closed. Click Enter scores to request the admin to reopen it for 1–3 days.
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {row.status === "APPROVED" ? (
                        <Button size="sm" variant="outline" onClick={() => onScoreEntry(row.id)}>
                          <Trophy className="h-4 w-4" />
                          {row.scoresSubmitted ? "View submitted scores" : "Enter scores"}
                        </Button>
                      ) : null}
                      {row.quizId ? (
                        <Link href={`/teacher/exams/${row.quizId}`}>
                          <Button size="sm" variant={row.status === "APPROVED" ? "default" : "outline"}>
                            {row.status === "APPROVED" ? (
                              <>
                                <Printer className="h-4 w-4" />
                                {actionLabel(row.status)}
                              </>
                            ) : (
                              actionLabel(row.status)
                            )}
                          </Button>
                        </Link>
                      ) : (
                        <Button size="sm" onClick={() => onGenerate(row.id)}>
                          {actionLabel(row.status)}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
