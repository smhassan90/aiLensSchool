import { API_BASE_URL } from '@/lib/api';

export function assetUrl(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const origin = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}
