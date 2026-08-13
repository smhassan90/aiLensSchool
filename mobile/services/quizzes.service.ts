import { apiFetch, buildQuery } from '@/lib/api';
import { PaginatedResult, Quiz } from '@/types/api';

export async function fetchQuizzes(
  studentId: string,
  params?: { page?: number; limit?: number; status?: string },
): Promise<PaginatedResult<Quiz>> {
  return apiFetch<PaginatedResult<Quiz>>(
    `/quizzes${buildQuery({ studentId, status: params?.status ?? 'PUBLISHED', ...params })}`,
  );
}

export async function fetchQuizById(id: string): Promise<Quiz> {
  return apiFetch<Quiz>(`/quizzes/${id}`);
}

export function isQuizNew(quiz: Quiz, days = 7): boolean {
  if (!quiz.publishedAt) return false;
  const published = new Date(quiz.publishedAt);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return published >= cutoff;
}
