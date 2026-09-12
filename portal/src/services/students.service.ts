import { apiClient, apiUpload, buildQuery } from "@/lib/api-client";
import type { Paginated, Student } from "@/lib/types";

export interface ParentCredential {
  relationship: "FATHER" | "MOTHER";
  name: string;
  username: string;
  password: string | null;
  existing: boolean;
}

export interface CreateStudentPayload {
  firstName: string;
  lastName?: string;
  studentCode: string;
  admissionNumber: string;
  dateOfBirth?: string;
  gender?: string;
  branchId: string;
  gradeId: string;
  sectionId: string;
  academicYearId: string;
  address?: string;
  scienceGroup?: string;
  father?: {
    firstName: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
  mother?: {
    firstName: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
}

export interface CreateStudentResult {
  student: Student;
  credentials: ParentCredential[];
}

export const studentsService = {
  list(params?: {
    page?: number;
    limit?: number;
    search?: string;
    branchId?: string;
    sectionId?: string;
    gradeId?: string;
    teacherId?: string;
    status?: string;
  }) {
    return apiClient<Paginated<Student>>(`/students${buildQuery(params ?? {})}`);
  },

  async listAll(params?: {
    branchId?: string;
    sectionId?: string;
    gradeId?: string;
    teacherId?: string;
    status?: string;
  }) {
    const limit = 100;
    const first = await studentsService.list({ ...params, limit, page: 1 });
    if (first.totalPages <= 1) return first;
    const rest = await Promise.all(
      Array.from({ length: first.totalPages - 1 }, (_, index) =>
        studentsService.list({ ...params, limit, page: index + 2 }),
      ),
    );
    const items = first.items.concat(...rest.map((page) => page.items));
    return { ...first, items, total: items.length, page: 1, limit: items.length, totalPages: 1 };
  },

  create(payload: CreateStudentPayload) {
    return apiClient<CreateStudentResult>("/students", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getById(id: string) {
    return apiClient<Student>(`/students/${id}`);
  },

  update(id: string, payload: { scienceGroup?: string | null }) {
    return apiClient<Student>(`/students/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  uploadPhoto(id: string, file: File) {
    return apiUpload<Student>(`/students/${id}/photo`, file);
  },
};
