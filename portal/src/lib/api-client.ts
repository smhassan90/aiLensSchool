import type { ApiErrorBody, ApiResponse } from "./types";
import { clearAuthSession } from "./auth";

const PRODUCTION_API_URL = "https://ai-school-lens-backend.vercel.app/api/v1";

function isLocalhostUrl(url: string) {
  return /localhost|127\.0\.0\.1/.test(url);
}

function isBrowserOnLocalhost() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

function isUsableRemoteApi(url: string) {
  if (!url || isLocalhostUrl(url) || !/^https?:\/\//i.test(url)) return false;
  try {
    const host = new URL(url).hostname;
    if (host === "ai-lens-school.vercel.app") return false;
    if (typeof window !== "undefined" && host === window.location.hostname) return false;
    return true;
  } catch {
    return false;
  }
}

/** Never call the Next.js portal as if it were the Nest API. */
export function getApiUrl(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_API_URL ?? "").trim().replace(/\/$/, "");

  if (isBrowserOnLocalhost()) {
    return fromEnv || PRODUCTION_API_URL;
  }

  if (isUsableRemoteApi(fromEnv)) return fromEnv;
  return PRODUCTION_API_URL;
}

export function getApiOrigin(): string {
  return getApiUrl().replace(/\/api\/v1\/?$/, "");
}

export function assetUrl(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${getApiOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}

export class ApiClientError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

function getErrorMessage(error: ApiErrorBody | string | undefined): string {
  if (!error) return "An unexpected error occurred";
  if (typeof error === "string") return error;
  return error.message ?? error.code ?? "An unexpected error occurred";
}

function isPublicAuthPath(path: string) {
  return (
    path.startsWith("/auth/login") ||
    path.startsWith("/auth/refresh") ||
    path.startsWith("/auth/forgot-password") ||
    path.startsWith("/auth/reset-password")
  );
}

let refreshInFlight: Promise<boolean> | null = null;
let redirectingToLogin = false;

function redirectToLogin() {
  if (typeof window === "undefined" || redirectingToLogin) return;
  const path = window.location.pathname;
  if (path.endsWith("/login")) return;
  redirectingToLogin = true;
  clearAuthSession();
  window.location.href = path.startsWith("/super-admin")
    ? "/super-admin/login"
    : "/login";
}

async function refreshAccessToken(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) return false;
    try {
      const response = await fetch(`${getApiUrl()}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      const payload = (await response.json()) as ApiResponse<{
        accessToken: string;
        refreshToken: string;
      }>;
      if (!response.ok || !payload?.success || !payload.data?.accessToken) {
        return false;
      }
      localStorage.setItem("accessToken", payload.data.accessToken);
      if (payload.data.refreshToken) {
        localStorage.setItem("refreshToken", payload.data.refreshToken);
      }
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

function applyAuthHeader(headers: Headers) {
  if (typeof window === "undefined") return;
  const token = localStorage.getItem("accessToken");
  if (token) headers.set("Authorization", `Bearer ${token}`);
}

async function parsePayload<T>(response: Response): Promise<ApiResponse<T> | null> {
  try {
    return (await response.json()) as ApiResponse<T>;
  } catch {
    return null;
  }
}

async function authorizedFetch<T>(path: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers);
  applyAuthHeader(headers);

  let response = await fetch(`${getApiUrl()}${path}`, { ...init, headers });
  let payload = await parsePayload<T>(response);

  if (response.status === 401 && !isPublicAuthPath(path)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const retryHeaders = new Headers(init.headers);
      applyAuthHeader(retryHeaders);
      response = await fetch(`${getApiUrl()}${path}`, { ...init, headers: retryHeaders });
      payload = await parsePayload<T>(response);
    } else {
      redirectToLogin();
    }
  }

  if (!payload) {
    if (!response.ok || response.status === 204 || (init.method && init.method !== "GET")) {
      throw new ApiClientError(
        response.status === 204
          ? "The server returned no content. Please try generating again."
          : response.statusText || "Request failed",
        response.status,
      );
    }
    return undefined as T;
  }

  if (!response.ok || !payload.success) {
    throw new ApiClientError(
      getErrorMessage(payload.error),
      response.status,
      typeof payload.error === "object" ? payload.error.code : undefined,
    );
  }

  return payload.data as T;
}

export async function apiClient<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  return authorizedFetch<T>(path, { ...options, headers });
}

export async function apiUpload<T>(path: string, file: File, fieldName = "file"): Promise<T> {
  const body = new FormData();
  body.append(fieldName, file);
  return authorizedFetch<T>(path, { method: "POST", body });
}

export async function apiForm<T>(path: string, body: FormData, method = "POST"): Promise<T> {
  return authorizedFetch<T>(path, { method, body });
}

export function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}
