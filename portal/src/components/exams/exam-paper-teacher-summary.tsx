"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ExamPaperSubmissionOverview } from "@/services/academics.service";
import { cn } from "@/lib/utils";

function statusBadge(status: "SUBMITTED" | "DRAFT" | "MISSING" | "REJECTED") {
  if (status === "SUBMITTED") return <Badge variant="success">Submitted</Badge>;
  if (status === "DRAFT") return <Badge variant="warning">Draft only</Badge>;
  if (status === "REJECTED") return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="destructive">Not submitted</Badge>;
}

export function ExamPaperTeacherSummary({
  teachers,
  detailBasePath = "/school/submitted-exam-papers",
  canReview = false,
}: {
  teachers: ExamPaperSubmissionOverview["teachers"];
  detailBasePath?: string;
  canReview?: boolean;
}) {
  if (!teachers.length) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
        No class-subject assignments match these filters.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {teachers.map((teacher) => {
        const pending = teacher.assignments.filter((row) => row.status !== "SUBMITTED");
        return (
          <div key={teacher.teacherId} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">{teacher.teacherName}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {teacher.submittedCount} of {teacher.expectedCount} papers submitted
                </p>
              </div>
              {pending.length ? (
                <Badge variant="warning">{pending.length} pending</Badge>
              ) : (
                <Badge variant="success">All submitted</Badge>
              )}
            </div>
            <ul className="mt-3 divide-y rounded-lg border">
              {teacher.assignments.map((row) => (
                <li
                  key={`${teacher.teacherId}-${row.sectionId}-${row.subjectId}`}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm",
                    row.status !== "SUBMITTED" && "bg-amber-50/60",
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {row.subjectName} · {row.className}
                    </p>
                    {row.status === "SUBMITTED" && row.submittedAt ? (
                      <p className="text-xs text-muted-foreground">
                        Submitted {new Date(row.submittedAt).toLocaleDateString("en-GB")}
                        {row.reviewStatus === "PENDING_REVIEW"
                          ? canReview
                            ? " · awaiting your approval"
                            : " · awaiting head teacher approval"
                          : row.reviewStatus === "APPROVED"
                            ? " · approved"
                            : ""}
                      </p>
                    ) : row.status === "MISSING" ? (
                      <p className="text-xs text-amber-800">Waiting for paper</p>
                    ) : (
                      <p className="text-xs text-amber-800">Generated but not submitted yet</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(row.status)}
                    {row.paperId && row.reviewStatus === "APPROVED" ? (
                      <Link href={`${detailBasePath}/${row.paperId}`}>
                        <Button size="sm" variant="outline">Print</Button>
                      </Link>
                    ) : row.paperId && canReview && row.reviewStatus === "PENDING_REVIEW" ? (
                      <Link href={`${detailBasePath}/${row.paperId}`}>
                        <Button size="sm" variant="outline">Review</Button>
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
