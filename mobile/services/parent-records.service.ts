import { apiFetch, buildQuery } from '@/lib/api';
import { DayOffRequest, FeeReceipt, HomeDiary, PaginatedResult, ReportCard, StudentFee } from '@/types/api';

export async function fetchStudentFees(
  studentId: string,
  params?: { page?: number; limit?: number },
): Promise<PaginatedResult<StudentFee> & { monthLabel?: string }> {
  return apiFetch<PaginatedResult<StudentFee> & { monthLabel?: string }>(
    `/fees${buildQuery({ studentId, ...params })}`,
  );
}

export async function fetchFeeReceipt(paymentId: string): Promise<FeeReceipt> {
  return apiFetch<FeeReceipt>(`/fees/receipts/${paymentId}`);
}

export async function fetchDayOffRequests(studentId?: string): Promise<DayOffRequest[]> {
  return apiFetch<DayOffRequest[]>(`/parents/day-off-requests${buildQuery({ studentId })}`);
}

export async function createDayOffRequest(input: {
  studentId: string;
  startDate: string;
  endDate: string;
  reason: string;
}): Promise<DayOffRequest> {
  return apiFetch<DayOffRequest>('/parents/day-off-requests', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteDayOffRequest(id: string): Promise<DayOffRequest> {
  return apiFetch<DayOffRequest>(`/parents/day-off-requests/${id}`, { method: 'DELETE' });
}

export async function fetchHomeDiaries(
  studentId: string,
  params?: { page?: number; limit?: number; date?: string },
): Promise<PaginatedResult<HomeDiary>> {
  return apiFetch<PaginatedResult<HomeDiary>>(
    `/documents/diaries${buildQuery({ studentId, ...params })}`,
  );
}

export async function fetchReportCards(
  studentId: string,
  params?: { page?: number; limit?: number },
): Promise<PaginatedResult<ReportCard>> {
  return apiFetch<PaginatedResult<ReportCard>>(
    `/documents/report-cards${buildQuery({ studentId, ...params })}`,
  );
}
