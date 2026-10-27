import { apiClient, buildQuery } from "@/lib/api-client";

export type RoundsPayload = {
  at: string;
  date: string;
  timezone: string;
  sections: Array<{
    section: { id: string; label: string };
    state: string;
    displayStatus: string;
    attentionReasons: string[];
    teacherPresence: string;
    period?: {
      periodNumber: number;
      startTime: string | null;
      endTime: string | null;
      subject: string;
    };
    planner?: { id: string; title: string };
    plannedLesson?: {
      lessonKey: string;
      title: string;
      chapterTitle: string | null;
      primaryStage: string;
      objectives: unknown;
      plannedMinutes: number;
    } | null;
    record?: { status: string; updatedAt: string };
    lastObservation?: { match: string; observedAt: string };
  }>;
};

export const classroomRoundsService = {
  now(params?: { at?: string; sectionIds?: string }) {
    return apiClient<RoundsPayload>(`/classroom-rounds/now${buildQuery(params ?? {})}`);
  },

  createObservation(body: Record<string, unknown>) {
    return apiClient<unknown>("/classroom-rounds/observations", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
};
