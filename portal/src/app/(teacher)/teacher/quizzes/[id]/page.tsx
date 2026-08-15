"use client";

import { useParams } from "next/navigation";
import { QuizDetailView } from "@/components/quizzes/quiz-detail-view";

export default function QuizDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <QuizDetailView
      quizId={params.id}
      listHref="/teacher/quizzes"
      listQueryKey={["teacher-quizzes"]}
    />
  );
}
