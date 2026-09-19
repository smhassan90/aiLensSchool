import { apiClient, buildQuery } from "@/lib/api-client";
import type { Paginated, Parent } from "@/lib/types";

export const parentsService = {
  list(params?: { page?: number; limit?: number; search?: string }) {
    return apiClient<Paginated<Parent>>(`/parents${buildQuery(params ?? {})}`);
  },

  resetPassword(id: string) {
    return apiClient<{
      parentId: string;
      username: string | null;
      temporaryPassword: string;
      mustChangePassword: boolean;
    }>(`/parents/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  listDayOffRequests(params?: { studentId?: string; sectionId?: string; date?: string }) {
    return apiClient<Array<{
      id: string;
      startDate: string;
      endDate: string;
      reason: string;
      status: "PENDING" | "APPROVED" | "REJECTED";
      reviewNote?: string | null;
      student: { id: string; firstName: string; lastName: string; studentCode: string };
      parent: { user: { firstName: string; lastName: string; username?: string | null } };
    }>>(`/parents/day-off-requests${buildQuery(params ?? {})}`);
  },

  reviewDayOffRequest(id: string, status: "APPROVED" | "REJECTED", reviewNote?: string) {
    return apiClient(`/parents/day-off-requests/${id}/review`, {
      method: "PATCH",
      body: JSON.stringify({ status, reviewNote }),
    });
  },
};
