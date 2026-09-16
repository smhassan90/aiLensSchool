"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExamPrintView } from "@/components/exams/exam-print-view";
import { ExamSolutionSheet } from "@/components/exams/exam-solution-sheet";
import { quizzesService } from "@/services/quizzes.service";
import { examPaperLabel, examStatusLabel, isExamPaper } from "@/lib/exam-paper";
import { difficultyColorClass, difficultyDescription, difficultyLabel } from "@/lib/difficulty";
import { personFullName } from "@/lib/person-name";

export function ExamPaperPrintScreen({
  quizId,
  listHref,
}: {
  quizId: string;
  listHref: string;
}) {
  const [printSolution, setPrintSolution] = useState(false);
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

  const print = (solution: boolean) => {
    setPrintSolution(solution);
    requestAnimationFrame(() => window.print());
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
              <Button variant="outline" onClick={() => print(false)}>
                <Printer className="h-4 w-4" />
                Print paper
              </Button>
              <Button onClick={() => print(true)}>
                <Printer className="h-4 w-4" />
                Print answer key
              </Button>
            </div>
          }
        />
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Badge variant={quiz.status === "CLOSED" ? "success" : "warning"}>
            {examStatusLabel(quiz.status, quiz.paperKind)}
          </Badge>
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
    </div>
  );
}
