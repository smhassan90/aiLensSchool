import { apiClient, buildQuery } from "@/lib/api-client";
import type { Paginated, StaffPermission } from "@/lib/types";

export const staffService = {
  permissions() {
    return apiClient<Array<{ key: StaffPermission; label: string; hint: string }>>("/users/permissions");
  },
  list(params?: { page?: number; limit?: number }) {
    return apiClient<Paginated<{
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      roles: string[];
      permissions: StaffPermission[];
    }>>(`/users/staff${buildQuery(params ?? {})}`);
  },
  create(payload: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone?: string;
    title?: string;
    role?: "PRINCIPAL";
    permissions: StaffPermission[];
  }) {
    return apiClient("/users/staff", { method: "POST", body: JSON.stringify(payload) });
  },
};

export const expensesService = {
  list() {
    return apiClient<Array<{
      id: string;
      title: string;
      category: string;
      amount: number;
      recurrence: string;
      expenseDate: string;
    }>>("/expenses");
  },
  create(payload: {
    title: string;
    category: string;
    amount: number;
    recurrence: string;
    expenseDate: string;
    notes?: string;
  }) {
    return apiClient("/expenses", { method: "POST", body: JSON.stringify(payload) });
  },
};

export const setupService = {
  run(payload: {
    yearName: string;
    startDate: string;
    endDate: string;
    teachers: Array<{ key: string; firstName: string; lastName?: string; phone: string }>;
    stages: Array<{ key: string; name: string; coordinatorKey?: string }>;
    classes: Array<{
      name: string;
      stageKey: string;
      classTeacherKey?: string;
      admissionFee?: number;
      tuitionFee?: number;
      subjects: Array<{ name: string; teacherKey?: string }>;
    }>;
    exams?: Array<{ name: string; maxMarks: number; sequence: number }>;
    minQuizzes?: number;
  }) {
    return apiClient<{
      ok: boolean;
      academicYearId: string;
      teachers: Array<{
        name: string;
        phone: string;
        email: string;
        temporaryPassword: string | null;
        employeeCode: string;
        existingAccount: boolean;
      }>;
    }>("/schools/setup", { method: "POST", body: JSON.stringify(payload) });
  },
};
