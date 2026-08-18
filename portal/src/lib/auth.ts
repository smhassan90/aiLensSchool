import type { AuthUser, LoginResponse, RoleName, StaffPermission } from "./types";

const ACCESS_TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";
const USER_KEY = "authUser";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setAuthSession(data: LoginResponse): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

export function clearAuthSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function hasRole(user: AuthUser | null, role: RoleName): boolean {
  return !!user?.roles.includes(role);
}

export function hasAnyRole(user: AuthUser | null, roles: RoleName[]): boolean {
  return !!user && roles.some((r) => user.roles.includes(r));
}

export function hasPermission(user: AuthUser | null, permission: StaffPermission): boolean {
  if (!user) return false;
  if (user.roles.includes("SUPER_ADMIN") || user.roles.includes("SCHOOL_ADMIN")) return true;
  return Boolean(user.permissions?.includes(permission));
}

export function getPrimaryRole(user: AuthUser | null): RoleName | null {
  if (!user) return null;
  const priority: RoleName[] = [
    "SUPER_ADMIN",
    "SCHOOL_ADMIN",
    "PRINCIPAL",
    "TEACHER",
    "PARENT",
    "STUDENT",
  ];
  return priority.find((r) => user.roles.includes(r)) ?? user.roles[0] ?? null;
}

export function getRoleRedirectPath(user: AuthUser | null): string {
  const role = getPrimaryRole(user);
  switch (role) {
    case "SUPER_ADMIN":
      return "/super-admin/dashboard";
    case "SCHOOL_ADMIN":
    case "PRINCIPAL":
      return "/school/dashboard";
    case "TEACHER":
      return "/teacher/dashboard";
    case "PARENT":
      return "/login";
    default:
      return "/login";
  }
}

export function getLoginPathForRole(role?: RoleName): string {
  if (role === "SUPER_ADMIN") return "/super-admin/login";
  return "/login";
}
