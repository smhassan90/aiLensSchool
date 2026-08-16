import { apiFetch, buildQuery } from '@/lib/api';
import { Homework, LessonSummary, PaginatedResult } from '@/types/api';
import { fetchHomework } from '@/services/homework.service';

export async function fetchLessonsForStudent(
  studentId: string,
  params?: { date?: string; limit?: number },
): Promise<LessonSummary[]> {
  const today = params?.date ?? new Date().toISOString().slice(0, 10);
  try {
    const response = await apiFetch<PaginatedResult<LessonSummary>>(
      `/lessons${buildQuery({ studentId, date: today, limit: params?.limit ?? 20 })}`,
    );
    return response.items;
  } catch {
    const homework = await fetchHomework(studentId, { limit: 50 });
    return homework.items
      .filter((item) => item.lessonId)
      .map(mapHomeworkToLesson)
      .filter((lesson) => !params?.date || lesson.date.slice(0, 10) === params.date);
  }
}

export async function fetchRecentLessons(studentId: string, limit = 20): Promise<LessonSummary[]> {
  try {
    const response = await apiFetch<PaginatedResult<LessonSummary>>(
      `/lessons${buildQuery({ studentId, limit })}`,
    );
    return response.items;
  } catch {
    const homework = await fetchHomework(studentId, { limit });
    return homework.items.filter((item) => item.lessonId).map(mapHomeworkToLesson);
  }
}

export async function fetchLessonById(
  id: string,
  studentId: string,
): Promise<LessonSummary | null> {
  try {
    return await apiFetch<LessonSummary>(`/lessons/${id}`);
  } catch {
    const homework = await fetchHomework(studentId, { limit: 100 });
    const linked = homework.items.find((item) => item.lessonId === id);
    return linked ? mapHomeworkToLesson(linked) : null;
  }
}

function mapHomeworkToLesson(item: Homework): LessonSummary {
  return {
    id: item.lessonId ?? item.id,
    date: item.publishedAt ?? item.dueDate,
    topicName: item.title,
    chapterName: item.subject?.name ?? undefined,
    aiSummary: item.description ?? undefined,
    subject: item.subject,
    status: 'CONFIRMED',
  };
}

export function isLessonToday(lesson: LessonSummary): boolean {
  const date = new Date(lesson.date);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}
