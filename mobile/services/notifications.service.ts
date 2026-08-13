import { apiFetch, buildQuery } from '@/lib/api';
import { NotificationItem, PaginatedResult } from '@/types/api';

export async function fetchNotifications(params?: {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}): Promise<PaginatedResult<NotificationItem>> {
  return apiFetch<PaginatedResult<NotificationItem>>(
    `/notifications${buildQuery(params ?? {})}`,
  );
}

export async function markNotificationRead(id: string): Promise<NotificationItem> {
  return apiFetch<NotificationItem>(`/notifications/${id}/read`, { method: 'PATCH' });
}

export async function registerDeviceToken(input: {
  token: string;
  platform?: string;
  deviceName?: string;
}): Promise<unknown> {
  return apiFetch('/notifications/device-token', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
