"use client";

import { useParams } from "next/navigation";
import { ExamPaperPrintScreen } from "@/components/exams/exam-paper-print-screen";

export default function SchoolExamPaperPrintPage() {
  const params = useParams<{ id: string }>();
  return (
    <ExamPaperPrintScreen
      quizId={params.id}
      listHref="/school/submitted-exam-papers"
    />
  );
}
