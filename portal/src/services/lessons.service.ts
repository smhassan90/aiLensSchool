import { apiClient, apiForm, buildQuery } from "@/lib/api-client";
import { lessonExtractTimeoutMs } from "@/lib/lesson-upload-limits";
import type {
  ClassSessionType,
  HomeworkSessionMode,
  Lesson,
  Paginated,
} from "@/lib/types";

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
  pageText?: string;
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

export interface CreateChapterPastePayload {
  academicYearId: string;
  gradeId: string;
  sectionId: string;
  subjectId: string;
  branchId: string;
  chapterName: string;
  topicName?: string;
  contentText: string;
}

export interface CreateChapterDraftPayload {
  academicYearId: string;
  gradeId: string;
  sectionId: string;
  subjectId: string;
  branchId: string;
  chapterName?: string;
  topicName?: string;
}

export interface CreateClassSessionPayload {
  academicYearId: string;
  gradeId: string;
  sectionId: string;
  subjectId: string;
  branchId: string;
  date: string;
  sessionType: ClassSessionType;
  chapterSourceId?: string;
  revisionChapterIds?: string[];
  parentSummary?: string;
  homeworkMode: HomeworkSessionMode;
  homeworkText?: string;
  homeworkDueDate?: string;
  homeworkInstruction?: string;
  homeworkTitle?: string;
  homeworkDescription?: string;
  homeworkAnswerKey?: string;
  homeworkQuestionsJson?: unknown;
}

export interface SubjectPaceSlice {
  label: string;
  days: number;
  chapterIds: string[];
  chapterId?: string | null;
  chapterName?: string | null;
  topicName?: string | null;
  chapterProgress?: string | null;
  contentPreview?: string | null;
  pageFrom?: number | null;
  pageTo?: number | null;
  addedDate?: string | null;
}

export interface SubjectPace {
  periodLabel: string;
  totalDays: number;
  slices: SubjectPaceSlice[];
}

function appendExtractForm(body: FormData, payload: ExtractLessonPayload) {
  body.append("academicYearId", payload.academicYearId);
  body.append("gradeId", payload.gradeId);
  body.append("sectionId", payload.sectionId);
  body.append("subjectId", payload.subjectId);
  body.append("branchId", payload.branchId);
  body.append("date", payload.date);
  if (payload.teacherNotes) body.append("teacherNotes", payload.teacherNotes);
  if (payload.pageFrom) body.append("pageFrom", String(payload.pageFrom));
  if (payload.pageTo) body.append("pageTo", String(payload.pageTo));
  if (payload.pageText) body.append("pageText", payload.pageText);
  for (const page of payload.pages) {
    body.append("pages", page);
  }
}

export const lessonsService = {
  list(params?: {
    page?: number;
    limit?: number;
    date?: string;
    status?: string;
    recordKind?: string;
    sectionId?: string;
    subjectId?: string;
  }) {
    return apiClient<Paginated<Lesson>>(`/lessons${buildQuery(params ?? {})}`);
  },

  listChapters(params?: { sectionId?: string; subjectId?: string; limit?: number }) {
    return apiClient<Lesson[]>(`/lessons/chapters${buildQuery(params ?? {})}`);
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
    appendExtractForm(body, payload);
    return apiForm<Lesson>("/lessons/extract", body, "POST", {
      timeoutMs: lessonExtractTimeoutMs(payload.pages.length),
    });
  },

  extractChapter(payload: ExtractLessonPayload) {
    const body = new FormData();
    appendExtractForm(body, payload);
    return apiForm<Lesson>("/lessons/chapters/extract", body, "POST", {
      timeoutMs: lessonExtractTimeoutMs(payload.pages.length),
    });
  },

  appendChapterPhotos(lessonId: string, pages: File[]) {
    const body = new FormData();
    for (const page of pages) {
      body.append("pages", page);
    }
    return apiForm<Lesson>(`/lessons/chapters/${lessonId}/append-photos`, body, "POST", {
      timeoutMs: lessonExtractTimeoutMs(pages.length),
    });
  },

  appendChapterText(lessonId: string, text: string) {
    return apiClient<Lesson>(`/lessons/chapters/${lessonId}/append-text`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  },

  reorderChapterPages(lessonId: string, sourceIds: string[]) {
    return apiClient<Lesson>(`/lessons/chapters/${lessonId}/page-order`, {
      method: "PATCH",
      body: JSON.stringify({ sourceIds }),
    });
  },

  pasteChapter(payload: CreateChapterPastePayload) {
    return apiClient<Lesson>("/lessons/chapters/paste", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  createChapterDraft(payload: CreateChapterDraftPayload) {
    return apiClient<Lesson>("/lessons/chapters/draft", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  confirmChapter(id: string, payload: { chapterName?: string; topicName?: string; contentText?: string }) {
    return apiClient<Lesson>(`/lessons/chapters/${id}/confirm-content`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  completeChapter(id: string) {
    return apiClient<Lesson>(`/lessons/chapters/${id}/complete`, { method: "PATCH" });
  },

  createClassSession(payload: CreateClassSessionPayload) {
    return apiClient<Lesson>("/lessons/class-sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  subjectPace(params: {
    sectionId: string;
    subjectId: string;
    teacherId?: string;
    academicYearId?: string;
  }) {
    return apiClient<SubjectPace>(`/lessons/subject-pace${buildQuery(params)}`);
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

  delete(id: string) {
    return apiClient<{ id: string; deleted: boolean }>(`/lessons/${id}`, { method: "DELETE" });
  },

  regenerateKeyPoints(id: string, instruction?: string) {
    return apiClient<Lesson>(`/lessons/${id}/key-points/regenerate`, {
      method: "POST",
      body: JSON.stringify({ instruction }),
    });
  },
};
