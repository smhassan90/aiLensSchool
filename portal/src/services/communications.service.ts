import { apiClient, buildQuery } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";

export interface Announcement {
  id: string;
  title: string;
  description: string;
  audience?: string;
  branchId?: string | null;
  gradeId?: string | null;
  sectionId?: string | null;
  status: string;
  publishAt?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface SchoolEvent {
  id: string;
  title: string;
  description?: string;
  type: string;
  startDate: string;
  endDate: string;
  location?: string;
}

export const communicationsService = {
  listAnnouncements(params?: { status?: string; limit?: number }) {
    return apiClient<Paginated<Announcement>>(`/announcements${buildQuery(params ?? {})}`);
  },
  createAnnouncement(payload: {
    title: string;
    description: string;
    audience?: string;
    sectionId?: string;
    sectionIds?: string[];
    publishAt?: string;
    expiresAt?: string;
  }) {
    return apiClient<Announcement | Announcement[]>("/announcements", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  publishAnnouncement(id: string) {
    return apiClient<Announcement>(`/announcements/${id}/publish`, { method: "POST" });
  },
  listEvents(params?: { limit?: number }) {
    return apiClient<Paginated<SchoolEvent>>(`/events${buildQuery(params ?? {})}`);
  },
  createEvent(payload: {
    title: string;
    description?: string;
    type: string;
    startDate: string;
    endDate: string;
    location?: string;
  }) {
    return apiClient<SchoolEvent>("/events", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
