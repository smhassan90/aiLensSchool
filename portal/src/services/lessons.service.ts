import { apiClient, apiForm, buildQuery } from "@/lib/api-client";
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

export interface ExtractLessonPayload {
  academicYearId: string;
  gradeId: string;
  sectionId: string;
  subjectId: string;
  branchId: string;
  date: string;
  teacherNotes?: string;
  pageFrom?: number;
  pageTo?: number;
  pages: File[];
}

export interface UpdateLessonPayload {
  chapterName?: string;
  topicName?: string;
  teacherNotes?: string;
  aiSummary?: string;
  extractedText?: string;
  pageFrom?: number;
  pageTo?: number;
  concepts?: string[];
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

  extract(payload: ExtractLessonPayload) {
    const body = new FormData();
    body.append("academicYearId", payload.academicYearId);
    body.append("gradeId", payload.gradeId);
    body.append("sectionId", payload.sectionId);
    body.append("subjectId", payload.subjectId);
    body.append("branchId", payload.branchId);
    body.append("date", payload.date);
    if (payload.teacherNotes) body.append("teacherNotes", payload.teacherNotes);
    if (payload.pageFrom) body.append("pageFrom", String(payload.pageFrom));
    if (payload.pageTo) body.append("pageTo", String(payload.pageTo));
    for (const page of payload.pages) {
      body.append("pages", page);
    }
    return apiForm<Lesson>("/lessons/extract", body);
  },

  update(id: string, payload: UpdateLessonPayload) {
    return apiClient<Lesson>(`/lessons/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  confirm(id: string) {
    return apiClient<Lesson>(`/lessons/${id}/confirm`, { method: "POST" });
  },

  regenerateKeyPoints(id: string, instruction?: string) {
    return apiClient<Lesson>(`/lessons/${id}/key-points/regenerate`, {
      method: "POST",
      body: JSON.stringify({ instruction }),
    });
  },
};
