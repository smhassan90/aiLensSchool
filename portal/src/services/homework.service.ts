import { apiClient, buildQuery } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";

export interface HomeworkItem {
  id: string;
  title: string;
  description?: string;
  answerKey?: string;
  dueDate: string;
  subject?: { name: string };
  section?: { name: string };
}

export const homeworkService = {
  list(params?: { sectionId?: string; subjectId?: string; studentId?: string; limit?: number }) {
    return apiClient<Paginated<HomeworkItem>>(`/homework${buildQuery(params ?? {})}`);
  },
  create(payload: {
    academicYearId: string;
    sectionId: string;
    subjectId: string;
    branchId: string;
    title: string;
    description?: string;
    answerKey?: string;
    questionsJson?: unknown;
    dueDate: string;
    lessonId?: string;
  }) {
    return apiClient<HomeworkItem>("/homework", { method: "POST", body: JSON.stringify(payload) });
  },
};
