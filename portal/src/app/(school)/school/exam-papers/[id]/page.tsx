"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExamPrintView } from "@/components/exams/exam-print-view";
import { quizzesService } from "@/services/quizzes.service";
import { examPaperLabel, examStatusLabel, isExamPaper } from "@/lib/exam-paper";

export default function SchoolExamPaperPrintPage() {
  const params = useParams<{ id: string }>();
  const [showAnswers, setShowAnswers] = useState(false);
  const paper = useQuery({
    queryKey: ["quiz", params.id],
    queryFn: () => quizzesService.getById(params.id),
    enabled: Boolean(params.id),
  });

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
            <Link href="/school/exam-papers">
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
              <Link href="/school/exam-papers">
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              </Link>
              <Button variant="outline" onClick={() => setShowAnswers((value) => !value)}>
                {showAnswers ? "Hide answer key" : "Show answer key"}
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                Print
              </Button>
            </div>
          }
        />
        <div className="mb-6">
          <Badge variant={quiz.status === "CLOSED" ? "success" : "warning"}>
            {examStatusLabel(quiz.status, quiz.paperKind)}
          </Badge>
        </div>
      </div>
      <ExamPrintView quiz={quiz} showAnswers={showAnswers} />
      <style>{`
        @media print {
          nav, aside, header { display: none !important; }
        }
      `}</style>
    </div>
  );
}
