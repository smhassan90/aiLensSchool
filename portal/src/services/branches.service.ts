import { apiClient, buildQuery } from "@/lib/api-client";
import type { Branch, Paginated } from "@/lib/types";

export const branchesService = {
  list(params?: { page?: number; limit?: number; search?: string; schoolId?: string }) {
    return apiClient<Paginated<Branch>>(`/branches${buildQuery(params ?? {})}`);
  },
};
