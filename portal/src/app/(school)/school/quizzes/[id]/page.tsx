"use client";

import { useParams } from "next/navigation";
import { QuizDetailView } from "@/components/quizzes/quiz-detail-view";

export default function SchoolQuizDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <QuizDetailView
      quizId={params.id}
      listHref="/school/quizzes"
      listQueryKey={["quizzes"]}
    />
  );
}
