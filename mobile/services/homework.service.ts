import { apiFetch, buildQuery } from '@/lib/api';
import { Homework, HomeworkResult, PaginatedResult } from '@/types/api';

export async function fetchHomework(
  studentId: string,
  params?: { page?: number; limit?: number },
): Promise<PaginatedResult<Homework>> {
  return apiFetch<PaginatedResult<Homework>>(
    `/homework${buildQuery({ studentId, ...params })}`,
  );
}

export async function fetchHomeworkById(id: string, studentId: string): Promise<Homework> {
  return apiFetch<Homework>(`/homework/${id}${buildQuery({ studentId })}`);
}

export async function submitHomework(
  id: string,
  payload: {
    studentId: string;
    answers: Array<{ questionId: string; optionId?: string; answerText?: string }>;
  },
): Promise<HomeworkResult & { title?: string }> {
  return apiFetch<HomeworkResult & { title?: string }>(`/homework/${id}/submit`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export {
  getHomeworkListStatus,
  homeworkStatusLabel,
  homeworkStatusTone,
  isHomeworkDueToday,
  isHomeworkPending,
  needsHomeworkSubmission,
} from '@/lib/homework-status';
