import { apiFetch, buildQuery } from '@/lib/api';
import { Homework, PaginatedResult } from '@/types/api';

export async function fetchHomework(
  studentId: string,
  params?: { page?: number; limit?: number },
): Promise<PaginatedResult<Homework>> {
  return apiFetch<PaginatedResult<Homework>>(
    `/homework${buildQuery({ studentId, ...params })}`,
  );
}

export async function fetchHomeworkById(id: string): Promise<Homework> {
  return apiFetch<Homework>(`/homework/${id}`);
}

export function isHomeworkPending(item: Homework): boolean {
  return new Date(item.dueDate) >= new Date();
}

export function isHomeworkDueToday(item: Homework): boolean {
  const due = new Date(item.dueDate);
  const today = new Date();
  return (
    due.getFullYear() === today.getFullYear() &&
    due.getMonth() === today.getMonth() &&
    due.getDate() === today.getDate()
  );
}
