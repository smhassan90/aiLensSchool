import { apiFetch, buildQuery } from '@/lib/api';
import { AttendanceRecord, PaginatedResult } from '@/types/api';

export async function fetchAttendance(
  studentId: string,
  params?: { page?: number; limit?: number; date?: string },
): Promise<PaginatedResult<AttendanceRecord>> {
  return apiFetch<PaginatedResult<AttendanceRecord>>(
    `/attendance${buildQuery({ studentId, ...params })}`,
  );
}

export function groupAttendanceByDate(
  records: AttendanceRecord[],
): Record<string, AttendanceRecord[]> {
  return records.reduce<Record<string, AttendanceRecord[]>>((acc, record) => {
    const key = record.date.slice(0, 10);
    acc[key] = acc[key] ?? [];
    acc[key].push(record);
    return acc;
  }, {});
}
