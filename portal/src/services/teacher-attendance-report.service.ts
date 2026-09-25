import { apiClient, buildQuery } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";

export type TeacherAttendanceHistoryRow = {
  date: string;
  teacher: { id: string; name: string; employeeCode: string };
  checkInTime: string | null;
  checkOutTime: string | null;
  status: string;
  source: string;
};

export type TeacherAttendanceHistoryResponse = {
  data: TeacherAttendanceHistoryRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export const teacherAttendanceReportService = {
  list: (query: {
    teacherId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) =>
    apiClient<TeacherAttendanceHistoryResponse>(`/teacher-attendance${buildQuery(query)}`),
  teachers: () =>
    apiClient<Array<{ id: string; name: string; employeeCode: string }>>("/teacher-attendance/teachers"),
};
