import { apiClient, buildQuery } from "@/lib/api-client";
import type { Paginated } from "@/lib/types";

export interface AttendanceRow {
  id: string;
  date: string;
  status: string;
  student?: {
    id: string;
    firstName: string;
    lastName: string;
    studentCode: string;
    dayOffRequests?: Array<{
      id: string;
      startDate: string;
      endDate: string;
      reason: string;
      status: "PENDING" | "APPROVED" | "REJECTED";
    }>;
  };
}

export const attendanceService = {
  list(params?: { sectionId?: string; studentId?: string; date?: string; limit?: number }) {
    return apiClient<Paginated<AttendanceRow>>(`/attendance${buildQuery(params ?? {})}`);
  },
  mark(payload: {
    academicYearId: string;
    sectionId: string;
    branchId: string;
    date: string;
    entries: Array<{ studentId: string; status: string; notes?: string }>;
  }) {
    return apiClient("/attendance", { method: "POST", body: JSON.stringify(payload) });
  },
};
