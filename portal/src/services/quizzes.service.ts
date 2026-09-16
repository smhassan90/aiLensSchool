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
  longAnswerCount?: number;
  mcqMarks?: number;
  trueFalseMarks?: number;
  fillBlankMarks?: number;
  openEndedMarks?: number;
  shortAnswerMarks?: number;
  longAnswerMarks?: number;
  paperKind?: string;
  title?: string;
  difficulty?: number;
  examConfigId?: string;
  examPaperAssignmentId?: string;
}

export interface UpdateQuizQuestionPayload {
  id: string;
  included?: boolean;
  questionText?: string;
  marks?: number;
  correctAnswer?: string;
  type?: string;
  order?: number;
}

export interface AddQuizQuestionPayload {
  type: string;
  questionText: string;
  marks: number;
  correctAnswer?: string;
  options?: Array<{ optionText: string; isCorrect?: boolean }>;
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

  addQuestion(id: string, payload: AddQuizQuestionPayload) {
    return apiClient<Quiz>(`/quizzes/${id}/questions`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  publish(id: string, payload?: { dueAt?: string; immediate?: boolean }) {
    return apiClient<Quiz>(`/quizzes/${id}/publish`, {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    });
  },

  submitPaper(id: string, questions?: UpdateQuizQuestionPayload[]) {
    return apiClient<Quiz>(`/quizzes/${id}/submit-paper`, {
      method: "POST",
      body: JSON.stringify(questions?.length ? { questions } : {}),
    });
  },

  approvePaper(id: string) {
    return apiClient<Quiz>(`/quizzes/${id}/approve-paper`, { method: "POST" });
  },

  rejectPaper(id: string, reason: string) {
    return apiClient<Quiz>(`/quizzes/${id}/reject-paper`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },
};
