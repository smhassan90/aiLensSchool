import { apiClient, buildQuery } from "@/lib/api-client";
import type { Paginated, Quiz } from "@/lib/types";

export interface GenerateQuizPayload {
  academicYearId: string;
  sectionId: string;
  subjectId: string;
  branchId: string;
  lessonDateFrom?: string;
  lessonDateTo?: string;
  homeworkIds?: string[];
  lessonIds?: string[];
  questionCount?: number;
  quickGenerate?: boolean;
  examPaper?: boolean;
  mcqCount?: number;
  fillBlankCount?: number;
  shortAnswerCount?: number;
  trueFalseCount?: number;
  openEndedCount?: number;
  mcqMarks?: number;
  trueFalseMarks?: number;
  openEndedMarks?: number;
  paperKind?: string;
  title?: string;
}

export interface UpdateQuizQuestionPayload {
  id: string;
  included?: boolean;
  questionText?: string;
  marks?: number;
  correctAnswer?: string;
  type?: string;
}

export const quizzesService = {
  list(params?: { page?: number; limit?: number; sectionId?: string; status?: string; paperKind?: string }) {
    return apiClient<Paginated<Quiz>>(`/quizzes${buildQuery(params ?? {})}`);
  },

  getById(id: string) {
    return apiClient<Quiz>(`/quizzes/${id}`);
  },

  generate(payload: GenerateQuizPayload) {
    return apiClient<Quiz>("/quizzes/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateQuestions(id: string, questions: UpdateQuizQuestionPayload[], title?: string) {
    return apiClient<Quiz>(`/quizzes/${id}/questions`, {
      method: "PATCH",
      body: JSON.stringify({ questions, title }),
    });
  },

  publish(id: string, payload?: { dueAt?: string; immediate?: boolean }) {
    return apiClient<Quiz>(`/quizzes/${id}/publish`, {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    });
  },

  submitPaper(id: string) {
    return apiClient<Quiz>(`/quizzes/${id}/submit-paper`, { method: "POST" });
  },
};
