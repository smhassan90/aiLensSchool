import { apiClient, buildQuery } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";

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
    return apiClient(`/results/quiz/${quizId}/stats`);
  },
};
