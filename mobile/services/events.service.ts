import { apiFetch, buildQuery } from '@/lib/api';
import { EventItem, PaginatedResult } from '@/types/api';

export async function fetchEvents(params?: {
  page?: number;
  limit?: number;
}): Promise<PaginatedResult<EventItem>> {
  return apiFetch<PaginatedResult<EventItem>>(`/events${buildQuery(params ?? {})}`);
}

export async function fetchEventById(id: string): Promise<EventItem> {
  return apiFetch<EventItem>(`/events/${id}`);
}

export function isUpcomingEvent(event: EventItem): boolean {
  return new Date(event.startDate) >= new Date();
}
