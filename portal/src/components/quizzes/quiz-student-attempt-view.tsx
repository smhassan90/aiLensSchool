"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/layout/page-loader";
import { resultsService } from "@/services/results.service";

export function QuizStudentAttemptView({
  resultId,
  onClose,
}: {
  resultId: string;
  onClose?: () => void;
}) {
  const detail = useQuery({
    queryKey: ["result-detail", resultId],
    queryFn: () => resultsService.detail(resultId),
  });

  if (detail.isLoading) {
    return <PageLoader variant="panel" task="quizzes" />;
  }

  if (detail.isError || !detail.data) {
    return (
      <p className="text-sm text-destructive">Could not load this student&apos;s attempt.</p>
    );
  }

  const data = detail.data;

  return (
    <div className="rounded-lg border bg-muted/20 p-4 sm:p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{data.quiz.title}</h3>
          <p className="text-sm text-muted-foreground">
            {data.student.firstName} {data.student.lastName} · {data.student.studentCode} ·{" "}
            {data.score}/{data.totalMarks} ({data.percentage}%)
          </p>
        </div>
        {onClose ? (
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        ) : null}
      </div>
      <div className="space-y-4">
        {data.questions.map((question) => (
          <div key={question.id} className="rounded-md border bg-card p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                Q{question.number}. {question.questionText}
              </p>
              <Badge
                variant={
                  question.isCorrect === true
                    ? "success"
                    : question.isCorrect === false
                      ? "destructive"
                      : "outline"
                }
              >
                {question.isCorrect === true
                  ? "Correct"
                  : question.isCorrect === false
                    ? "Incorrect"
                    : "Not answered"}
              </Badge>
            </div>
            {question.options.length ? (
              <div className="space-y-1 text-sm">
                {question.options.map((option) => (
                  <p
                    key={option.id}
                    className={`rounded px-2 py-1 ${
                      option.id === question.selectedOptionId
                        ? option.isCorrect
                          ? "bg-emerald-100 text-emerald-900"
                          : "bg-rose-100 text-rose-900"
                        : option.isCorrect
                          ? "bg-emerald-50 text-emerald-800"
                          : ""
                    }`}
                  >
                    {option.text}
                    {option.id === question.selectedOptionId ? " · Student selected" : ""}
                    {option.isCorrect ? " · Correct answer" : ""}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Student answer: {question.selectedAnswer ?? "Not answered"}
                {question.correctAnswer ? (
                  <span className="block mt-1">Correct answer: {question.correctAnswer}</span>
                ) : null}
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Marks: {question.marksAwarded ?? 0}/{question.marks}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
