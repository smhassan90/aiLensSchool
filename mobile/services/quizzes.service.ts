import { apiFetch, buildQuery } from '@/lib/api';
import { PaginatedResult, Quiz, QuizResult } from '@/types/api';

export async function fetchQuizzes(
  studentId: string,
  params?: { page?: number; limit?: number; status?: string },
): Promise<PaginatedResult<Quiz>> {
  return apiFetch<PaginatedResult<Quiz>>(
    `/quizzes${buildQuery({ status: 'PUBLISHED', ...params, studentId })}`,
  );
}

export async function fetchQuizById(id: string, studentId: string): Promise<Quiz> {
  return apiFetch<Quiz>(`/quizzes/${id}${buildQuery({ studentId })}`);
}

export async function submitQuiz(
  id: string,
  payload: {
    studentId: string;
    answers: Array<{ questionId: string; optionId?: string; answerText?: string }>;
  },
): Promise<QuizResult> {
  return apiFetch<QuizResult>(`/quizzes/${id}/submit`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function isQuizNew(quiz: Quiz, options?: { hasResult?: boolean; days?: number }): boolean {
  if (options?.hasResult) return false;
  if (!quiz.publishedAt) return false;
  const published = new Date(quiz.publishedAt);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (options?.days ?? 7));
  return published >= cutoff;
}
