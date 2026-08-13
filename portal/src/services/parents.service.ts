import { apiClient, buildQuery } from "@/lib/api-client";
import type { Paginated, Parent } from "@/lib/types";

export const parentsService = {
  list(params?: { page?: number; limit?: number; search?: string }) {
    return apiClient<Paginated<Parent>>(`/parents${buildQuery(params ?? {})}`);
  },
};
