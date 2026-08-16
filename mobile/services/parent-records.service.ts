import { apiFetch, buildQuery } from '@/lib/api';
import { HomeDiary, PaginatedResult, ReportCard, StudentFee } from '@/types/api';

export async function fetchStudentFees(
  studentId: string,
  params?: { page?: number; limit?: number },
): Promise<PaginatedResult<StudentFee>> {
  return apiFetch<PaginatedResult<StudentFee>>(
    `/fees${buildQuery({ studentId, ...params })}`,
  );
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
