"use client";

import { cn, formatMarks } from "@/lib/utils";
import type { Quiz } from "@/lib/types";
import { isExamPaper } from "@/lib/exam-paper";

export function examPaperIncludedMarks(quiz: Quiz): {
  includedCount: number;
  includedMarks: number;
  requiredMarks?: number;
  marksReady: boolean;
} {
  const included = (quiz.questions ?? []).filter((q) => q.included);
  const includedMarks = included.reduce((sum, q) => sum + Number(q.marks ?? 0), 0);
  const requiredMarks = isExamPaper(quiz.paperKind)
    ? quiz.examPaperAssignment?.maxMarks
    : undefined;
  const marksReady =
    requiredMarks == null || Math.round(includedMarks * 100) === Math.round(requiredMarks * 100);
  return {
    includedCount: included.length,
    includedMarks,
    requiredMarks: requiredMarks ?? undefined,
    marksReady,
  };
}

export function ExamPaperMarksBanner({
  quiz,
  className,
}: {
  quiz: Quiz;
  className?: string;
}) {
  if (!isExamPaper(quiz.paperKind)) return null;
  const { includedCount, includedMarks, requiredMarks, marksReady } = examPaperIncludedMarks(quiz);
  if (requiredMarks == null) return null;

  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        marksReady ? "border-border bg-muted/30" : "border-amber-300 bg-amber-50 text-amber-950",
        className,
      )}
    >
      <p className="font-medium">
        Included marks: {formatMarks(includedMarks)} / {formatMarks(requiredMarks)}
        <span className="ml-2 font-normal text-muted-foreground">
          ({includedCount} question{includedCount === 1 ? "" : "s"})
        </span>
      </p>
      {!marksReady ? (
        <p className="mt-1">
          Total must be exactly {formatMarks(requiredMarks)} before you can submit. Include, exclude,
          or edit question marks to match.
        </p>
      ) : (
        <p className="mt-1 text-muted-foreground">Marks match the required total. You can submit.</p>
      )}
    </div>
  );
}
