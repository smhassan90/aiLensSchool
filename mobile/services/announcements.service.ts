import { apiFetch, buildQuery } from '@/lib/api';
import { Announcement, PaginatedResult } from '@/types/api';

export async function fetchAnnouncements(params?: {
  page?: number;
  limit?: number;
  status?: string;
}): Promise<PaginatedResult<Announcement>> {
  return apiFetch<PaginatedResult<Announcement>>(
    `/announcements${buildQuery({ status: params?.status ?? 'PUBLISHED', ...params })}`,
  );
}

export function findAnnouncementById(
  items: Announcement[],
  id: string,
): Announcement | undefined {
  return items.find((item) => item.id === id);
}
