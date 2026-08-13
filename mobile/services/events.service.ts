import { apiFetch, buildQuery } from '@/lib/api';
import { EventItem, PaginatedResult } from '@/types/api';

export async function fetchEvents(params?: {
  page?: number;
  limit?: number;
}): Promise<PaginatedResult<EventItem>> {
  return apiFetch<PaginatedResult<EventItem>>(`/events${buildQuery(params ?? {})}`);
}

export function isUpcomingEvent(event: EventItem): boolean {
  return new Date(event.startDate) >= new Date();
}

export function findEventById(events: EventItem[], id: string): EventItem | undefined {
  return events.find((event) => event.id === id);
}
