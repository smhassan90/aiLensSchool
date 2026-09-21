"use client";

import { useParams } from "next/navigation";
import { ExamPaperPrintScreen } from "@/components/exams/exam-paper-print-screen";

export default function HeadTeacherExamPaperPrintPage() {
  const params = useParams<{ id: string }>();
  return (
    <ExamPaperPrintScreen
      quizId={params.id}
      listHref="/teacher/head/exam-papers"
      canReview
      submissionsQueryKey="head-teacher-exam-papers"
    />
  );
}
