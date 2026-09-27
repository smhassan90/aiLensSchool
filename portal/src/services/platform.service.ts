import { apiClient, buildQuery } from "@/lib/api-client";

export type SchoolAiUsageRow = {
  id: string;
  name: string;
  code: string;
  status: string;
  city: string | null;
  ai: {
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

export type SchoolAiDetail = {
  school: { id: string; name: string; code: string; status: string };
  totals: SchoolAiUsageRow["ai"];
  teachers: Array<{
    id: string;
    employeeCode: string;
    name: string;
    email: string;
    userId: string;
    ai: SchoolAiUsageRow["ai"];
  }>;
};

export type TeacherLessonTrail = {
  teacher: { id: string; employeeCode: string; name: string; email: string; userId: string };
  lessons: Array<{
    id: string;
    date: string;
    status: string;
    chapterName: string | null;
    topicName: string | null;
    subjectName: string;
    classLabel: string;
    pageImages: Array<{
      sourceId: string;
      page: number | null;
      url: string;
      filename: string;
      mimeType: string;
    }>;
    rawOcrText: string | null;
    aiGeneratedText: string | null;
    concepts: string[];
    homework: Array<{
      id: string;
      title: string;
      description: string | null;
      answerKey: string | null;
      questionsJson: unknown;
      createdAt: string;
    }>;
    createdAt: string;
  }>;
  aiRequests: Array<{
    id: string;
    type: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    status: string;
    createdAt: string;
  }>;
};

export const platformService = {
  listSchoolAiUsage() {
    return apiClient<SchoolAiUsageRow[]>("/platform/ai-usage/schools");
  },
  getSchoolAiUsage(schoolId: string) {
    return apiClient<SchoolAiDetail>(`/platform/ai-usage/schools/${schoolId}`);
  },
  getTeacherLessonTrail(schoolId: string, teacherId: string) {
    return apiClient<TeacherLessonTrail>(
      `/platform/ai-usage/schools/${schoolId}/teachers/${teacherId}`,
    );
  },
  listActivity(params?: { schoolId?: string; from?: string; to?: string; page?: number; limit?: number }) {
    return apiClient<{
      audit: { items: unknown[]; total: number };
      ai: { items: unknown[]; total: number };
    }>(`/platform/activity${buildQuery(params ?? {})}`);
  },
  purgeData(payload: { schoolId?: string; from: string; to: string; confirm: boolean }) {
    return apiClient<{ auditDeleted: number; aiDeleted: number; lessonsDeleted: number }>(
      "/platform/data-purge",
      { method: "POST", body: JSON.stringify(payload) },
    );
  },
};
