import { type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { QuizQuestion } from "@/lib/types";
import {
  cn,
  isQuizOptionCorrect,
  quizCorrectAnswer,
  quizOptionLabel,
  quizQuestionTypeLabel,
} from "@/lib/utils";

interface QuizReviewQuestionProps {
  question: QuizQuestion;
  index: number;
  action?: ReactNode;
  dimmed?: boolean;
}

export function QuizReviewQuestion({
  question,
  index,
  action,
  dimmed,
}: QuizReviewQuestionProps) {
  const options = question.options ?? [];
  const answer = quizCorrectAnswer(question);

  return (
    <Card className={cn(dimmed && "opacity-60")}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{quizQuestionTypeLabel(question.type)}</Badge>
              <span className="text-xs text-muted-foreground">{Number(question.marks)} mark{Number(question.marks) === 1 ? "" : "s"}</span>
            </div>
            <CardTitle className="text-base font-medium leading-6">
              Q{index + 1}. {question.questionText}
            </CardTitle>
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {options.length > 0 ? (
          <ul className="space-y-1.5">
            {options.map((opt, i) => {
              const label = quizOptionLabel(opt);
              const letter = String.fromCharCode(65 + i);
              const correct = isQuizOptionCorrect(opt, answer);
              return (
                <li
                  key={opt.id ?? `${question.id}-${i}`}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-md px-3 py-2",
                    correct ? "bg-emerald-50 text-emerald-950" : "bg-muted/60 text-foreground",
                  )}
                >
                  <span>
                    {letter}. {label}
                  </span>
                  {correct ? <Badge variant="success">Correct</Badge> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {answer ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-950">
            Right answer: <span className="font-semibold">{answer}</span>
          </p>
        ) : (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            No right answer was stored for this question.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
