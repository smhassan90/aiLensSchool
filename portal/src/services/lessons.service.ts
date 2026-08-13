import { apiClient, buildQuery } from "@/lib/api-client";
import type { Lesson, Paginated } from "@/lib/types";

export interface CreateLessonPayload {
  academicYearId: string;
  gradeId: string;
  sectionId: string;
  subjectId: string;
  branchId: string;
  date: string;
  chapterName?: string;
  topicName?: string;
  teacherNotes?: string;
  pageFrom?: number;
  pageTo?: number;
}

export const lessonsService = {
  list(params?: {
    page?: number;
    limit?: number;
    date?: string;
    status?: string;
    sectionId?: string;
    subjectId?: string;
  }) {
    return apiClient<Paginated<Lesson>>(`/lessons${buildQuery(params ?? {})}`);
  },

  getById(id: string) {
    return apiClient<Lesson>(`/lessons/${id}`);
  },

  create(payload: CreateLessonPayload) {
    return apiClient<Lesson>("/lessons", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  confirm(id: string) {
    return apiClient<Lesson>(`/lessons/${id}/confirm`, { method: "POST" });
  },
};
