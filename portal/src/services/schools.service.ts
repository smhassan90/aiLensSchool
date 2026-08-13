import { apiClient, buildQuery } from "@/lib/api-client";
import type { DashboardStats, Paginated, School } from "@/lib/types";

export interface CreateSchoolPayload {
  name: string;
  code: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  branch?: {
    name: string;
    code: string;
    address?: string;
    phone?: string;
  };
  admin: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    password: string;
  };
}

export const schoolsService = {
  dashboardStats() {
    return apiClient<DashboardStats>("/schools/dashboard/stats");
  },

  list(params?: { page?: number; limit?: number; search?: string; status?: string }) {
    return apiClient<Paginated<School>>(`/schools${buildQuery(params ?? {})}`);
  },

  create(payload: CreateSchoolPayload) {
    return apiClient<School>("/schools", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getById(id: string) {
    return apiClient<School>(`/schools/${id}`);
  },

  update(id: string, payload: Partial<Pick<School, "name" | "email" | "phone" | "address" | "city" | "country">>) {
    return apiClient<School>(`/schools/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
};
