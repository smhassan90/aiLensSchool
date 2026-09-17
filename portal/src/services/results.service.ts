import { apiClient, buildQuery } from "@/lib/api-client";
import type { Paginated, QuizAnalysis } from "@/lib/types";

export interface QuizResultRow {
  id: string;
  score: number;
  totalMarks: number;
  percentage: number;
  submittedAt: string;
  student?: { firstName: string; lastName: string; studentCode: string };
  quiz?: { id: string; title: string };
}

export const resultsService = {
  list(params?: { quizId?: string; studentId?: string; limit?: number }) {
    return apiClient<Paginated<QuizResultRow>>(`/results${buildQuery(params ?? {})}`);
  },
  quizStats(quizId: string) {
    return apiClient<QuizAnalysis>(`/results/quiz/${quizId}/stats`);
  },
  detail(id: string) {
    return apiClient<{
      id: string;
      quiz: { id: string; title: string; totalMarks: number };
      student: { firstName: string; lastName: string; studentCode: string };
      score: number;
      totalMarks: number;
      percentage: number;
      submittedAt: string;
      questions: Array<{
        id: string;
        number: number;
        questionText: string;
        type: string;
        marks: number;
        correctAnswer: string | null;
        options: Array<{ id: string; text: string; isCorrect: boolean }>;
        selectedAnswer: string | null;
        selectedOptionId: string | null;
        isCorrect: boolean | null;
        marksAwarded: number | null;
      }>;
    }>(`/results/${id}`);
  },
};
