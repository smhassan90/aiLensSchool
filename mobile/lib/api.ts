import Constants from 'expo-constants';
import { ApiErrorBody, ApiResponse, LoginResponse, MeResponse, RefreshResponse } from '@/types/api';
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from '@/lib/storage';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'https://ai-school-lens-backend.vercel.app/api/v1';

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

type RequestOptions = RequestInit & {
  auth?: boolean;
  skipRefresh?: boolean;
};

let refreshPromise: Promise<string | null> | null = null;

async function parseError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody = {};
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // ignore parse errors
  }
  const message =
    body.message ??
    (typeof body === 'object' && body !== null && 'error' in body
      ? String((body as { error?: string }).error)
      : `Request failed (${response.status})`);
  return new ApiError(message, response.status, body.code);
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return null;

      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        await clearTokens();
        return null;
      }

      const json = (await response.json()) as ApiResponse<RefreshResponse>;
      await setTokens(json.data.accessToken, json.data.refreshToken);
      return json.data.accessToken;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, skipRefresh = false, headers, ...rest } = options;
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(headers as Record<string, string>),
  };

  if (rest.body && !requestHeaders['Content-Type']) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  if (auth) {
    const token = await getAccessToken();
    if (token) {
      requestHeaders.Authorization = `Bearer ${token}`;
    }
  }

  let response = await fetch(url, { ...rest, headers: requestHeaders });

  if (response.status === 401 && auth && !skipRefresh) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      requestHeaders.Authorization = `Bearer ${newToken}`;
      response = await fetch(url, { ...rest, headers: requestHeaders });
    }
  }

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const json = (await response.json()) as ApiResponse<T> | T;
  if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
    return (json as ApiResponse<T>).data;
  }
  return json as T;
}

export async function loginRequest(username: string, password: string): Promise<LoginResponse> {
  const identifier = username.trim();
  return apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({
      username: identifier,
      email: identifier.includes('@') ? identifier : undefined,
      password,
      expectedRole: 'PARENT',
    }),
  });
}

export async function changePasswordRequest(currentPassword: string, newPassword: string): Promise<{ message: string }> {
  return apiFetch('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function logoutRequest(refreshToken?: string | null): Promise<void> {
  try {
    await apiFetch('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: refreshToken ?? undefined }),
    });
  } catch {
    // best effort
  }
}

export async function fetchMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>('/auth/me');
}

export function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}
