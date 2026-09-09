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
};
