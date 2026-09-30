import { apiClient, buildQuery } from "@/lib/api-client";

export type StaffAttendanceHistoryRow = {
  date: string;
  staff: { id: string; name: string; employeeCode: string };
  checkInTime: string | null;
  checkOutTime: string | null;
  status: string;
  source: string;
};

export type StaffAttendanceHistoryResponse = {
  data: StaffAttendanceHistoryRow[];
  timezone: string;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type StaffAttendanceDayResponse = {
  date: string;
  policy: { lateAfter: string; absentAfter: string; timezone: string };
  staff: Array<{
    staffUserId: string;
    name: string;
    employeeCode: string;
    status: string | null;
    checkedInAt: string | null;
    checkedOutAt: string | null;
    source: string | null;
  }>;
  summary: { present: number; late: number; absent: number; waiting: number };
};

export const staffAttendanceReportService = {
  day(date?: string) {
    return apiClient<StaffAttendanceDayResponse>(`/staff-attendance/day${buildQuery({ date })}`);
  },
  list(query: {
    startDate?: string;
    endDate?: string;
    staffUserId?: string;
    page?: number;
    limit?: number;
  }) {
    return apiClient<StaffAttendanceHistoryResponse>(`/staff-attendance${buildQuery(query)}`);
  },
  members() {
    return apiClient<Array<{ id: string; name: string; employeeCode: string }>>("/staff-attendance/members");
  },
  manualCheckIn(staffUserId: string, date: string) {
    return apiClient("/staff-attendance/manual-check-in", {
      method: "POST",
      body: JSON.stringify({ staffUserId, date }),
    });
  },
};
