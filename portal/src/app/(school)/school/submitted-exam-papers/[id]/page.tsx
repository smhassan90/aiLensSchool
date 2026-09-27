"use client";

import { useParams } from "next/navigation";
import { ExamPaperPrintScreen } from "@/components/exams/exam-paper-print-screen";
import { useAuth } from "@/providers/auth-provider";

export default function SubmittedExamPaperPrintPage() {
  const params = useParams<{ id: string }>();
  const { can } = useAuth();
  return (
    <ExamPaperPrintScreen
      quizId={params.id}
      listHref="/school/submitted-exam-papers"
      canReview={can("MANAGE_EXAMS")}
    />
  );
}
