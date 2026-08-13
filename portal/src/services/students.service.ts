import { apiClient, buildQuery } from "@/lib/api-client";
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
  lastName: string;
  studentCode: string;
  admissionNumber: string;
  dateOfBirth?: string;
  gender?: string;
  branchId: string;
  gradeId: string;
  sectionId: string;
  academicYearId: string;
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
  list(params?: { page?: number; limit?: number; search?: string; branchId?: string }) {
    return apiClient<Paginated<Student>>(`/students${buildQuery(params ?? {})}`);
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
};
