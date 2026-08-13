import { apiClient, buildQuery } from "@/lib/api-client";
import type { SearchResults } from "@/lib/types";

export const insightsService = {
  search(q: string) {
    return apiClient<SearchResults>(`/search${buildQuery({ q })}`);
  },
  student(id: string) {
    return apiClient<Record<string, unknown>>(`/insights/students/${id}`);
  },
  parent(id: string) {
    return apiClient<Record<string, unknown>>(`/insights/parents/${id}`);
  },
  classOverview(gradeId: string, sectionId?: string) {
    return apiClient<Record<string, unknown>>(`/insights/classes/${gradeId}${buildQuery({ sectionId })}`);
  },
};
