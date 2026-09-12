"use client";

import { useParams } from "next/navigation";
import { QuizDetailView } from "@/components/quizzes/quiz-detail-view";

export default function TeacherExamDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <QuizDetailView
      quizId={params.id}
      listHref="/teacher/exams"
      listQueryKey={["teacher-exam-papers"]}
    />
  );
}
