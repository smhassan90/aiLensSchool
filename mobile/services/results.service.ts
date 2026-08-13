import { apiFetch, buildQuery } from '@/lib/api';
import { PaginatedResult, QuizResult } from '@/types/api';

export async function fetchQuizResults(
  studentId: string,
  params?: { quizId?: string; page?: number; limit?: number },
): Promise<PaginatedResult<QuizResult>> {
  return apiFetch<PaginatedResult<QuizResult>>(
    `/results${buildQuery({ studentId, ...params })}`,
  );
}

export async function fetchQuizResultForStudent(
  studentId: string,
  quizId: string,
): Promise<QuizResult | null> {
  const result = await fetchQuizResults(studentId, { quizId, limit: 1 });
  return result.items[0] ?? null;
}
