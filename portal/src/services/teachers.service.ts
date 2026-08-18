import { apiClient, buildQuery } from "@/lib/api-client";
import type {
  Paginated,
  Teacher,
  TeacherClass,
  TeacherClassAssignment,
} from "@/lib/types";

function mapClassAssignment(item: TeacherClassAssignment & { role?: "TEACHER" | "ASSISTANT" }): TeacherClass {
  return {
    sectionId: item.sectionId,
    sectionName: item.section?.name ?? "—",
    gradeName: item.section?.grade?.name ?? "—",
    gradeId: item.section?.grade?.id,
    subjectId: item.subjectId,
    subjectName: item.subject?.name ?? "—",
    academicYearId: item.academicYearId,
    branchId: item.branchId,
    role: item.role,
  };
}

export interface CreateTeacherPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password: string;
  branchId: string;
  employeeCode: string;
  hireDate?: string;
}

export const teachersService = {
  myClasses() {
    return apiClient<TeacherClassAssignment[]>("/teachers/me/classes").then((items) =>
      items.map(mapClassAssignment),
    );
  },

  list(params?: { page?: number; limit?: number; search?: string; branchId?: string }) {
    return apiClient<Paginated<Teacher>>(`/teachers${buildQuery(params ?? {})}`);
  },

  create(payload: CreateTeacherPayload) {
    return apiClient<Teacher>("/teachers", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getById(id: string) {
    return apiClient<Teacher>(`/teachers/${id}`);
  },

  performance(id: string) {
    return apiClient<Record<string, unknown>>(`/teachers/${id}/performance`);
  },

  coach(id: string) {
    return apiClient<{
      performance: Record<string, unknown>;
      coaching: {
        headline: string;
        verdict: string;
        cards: Array<{ title: string; body: string; tone: string }>;
        sayToTeacher: string;
      };
    }>(`/teachers/${id}/coach`, { method: "POST" });
  },
};
