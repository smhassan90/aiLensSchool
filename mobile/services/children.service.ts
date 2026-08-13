import { apiFetch, buildQuery } from '@/lib/api';
import { ChildLink } from '@/types/api';

export async function fetchMyChildren(): Promise<ChildLink[]> {
  return apiFetch<ChildLink[]>('/parents/me/children');
}
