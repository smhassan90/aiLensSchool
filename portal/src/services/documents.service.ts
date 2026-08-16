import { apiClient, buildQuery } from "@/lib/api-client";
import type { HomeDiary, IdCard, Paginated, ReportCard } from "@/lib/types";

export interface HomeDiaryPreview {
  academicYearId: string;
  sectionId: string;
  branchId: string;
  date: string;
  title: string;
  lessonSummary: string;
  homeworkNotes: string;
  teacherRemarks?: string;
}

export interface HomeworkPreview {
  lessonId: string;
  academicYearId: string;
  sectionId: string;
  subjectId: string;
  branchId: string;
  title: string;
  description: string;
  dueDate: string;
}

export const documentsService = {
  listDiaries(params?: { sectionId?: string; date?: string; studentId?: string; limit?: number }) {
    return apiClient<Paginated<HomeDiary>>(`/documents/diaries${buildQuery(params ?? {})}`);
  },
  previewDiary(payload: {
    academicYearId: string;
    sectionId: string;
    branchId: string;
    date: string;
    lessonId?: string;
    instruction?: string;
  }) {
    return apiClient<HomeDiaryPreview>("/documents/diaries/preview", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  generateDiary(payload: { academicYearId: string; sectionId: string; branchId: string; date: string }) {
    return apiClient<HomeDiary>("/documents/diaries/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  createDiary(payload: {
    academicYearId: string;
    sectionId: string;
    branchId: string;
    date: string;
    title?: string;
    lessonSummary?: string;
    homeworkNotes?: string;
    teacherRemarks?: string;
  }) {
    return apiClient<HomeDiary>("/documents/diaries", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  generateHomework(payload: {
    academicYearId: string;
    sectionId: string;
    subjectId: string;
    branchId: string;
    title: string;
    dueDate: string;
    lessonId?: string;
  }) {
    return apiClient("/documents/homework/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  previewHomework(payload: { lessonId: string; dueDate?: string; instruction?: string }) {
    return apiClient<HomeworkPreview>("/documents/homework/preview", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  generateReportCards(payload: { academicYearId: string; sectionId?: string; studentId?: string; termLabel?: string }) {
    return apiClient<{ generated: number; items: ReportCard[] }>("/documents/report-cards/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  listReportCards(params?: { studentId?: string; sectionId?: string; academicYearId?: string; limit?: number }) {
    return apiClient<Paginated<ReportCard>>(`/documents/report-cards${buildQuery(params ?? {})}`);
  },
  generateIdCards(payload: { studentId?: string; teacherId?: string; sectionId?: string }) {
    return apiClient<{ generated: number; items: IdCard[] }>("/documents/id-cards/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  listIdCards(params?: { studentId?: string; search?: string; limit?: number }) {
    return apiClient<Paginated<IdCard>>(`/documents/id-cards${buildQuery(params ?? {})}`);
  },
};
