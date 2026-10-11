"use client";

import type { ExamAnswerSpaceMode } from "@/lib/exam-answer-space";
import { cn } from "@/lib/utils";

type ExamAnswerSpaceToggleProps = {
  value: ExamAnswerSpaceMode;
  onChange: (value: ExamAnswerSpaceMode) => void;
  className?: string;
};

export function ExamAnswerSpaceToggle({ value, onChange, className }: ExamAnswerSpaceToggleProps) {
  return (
    <div
      className={cn(
        "print:hidden rounded-lg border bg-muted/30 px-4 py-3 text-sm",
        className,
      )}
    >
      <p className="font-medium text-foreground">Where will students write answers?</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Answer sheet mode removes ruling lines under short and long questions on the question paper.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange("on_paper")}
          className={cn(
            "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
            value === "on_paper"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background hover:bg-muted",
          )}
        >
          On question paper
        </button>
        <button
          type="button"
          onClick={() => onChange("answer_sheet")}
          className={cn(
            "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
            value === "answer_sheet"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background hover:bg-muted",
          )}
        >
          On answer sheet
        </button>
      </div>
    </div>
  );
}
