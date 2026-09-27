import type { RoleName } from "./types";

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Not started",
  DRAFT: "Draft",
  PENDING: "Pending approval",
  PENDING_REVIEW: "Pending review",
  READY_FOR_REVIEW: "Ready for review",
  CONFIRMED: "Confirmed",
  PUBLISHED: "Published",
  CLOSED: "Closed",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

const ROLE_LABELS: Record<RoleName, string> = {
  SUPER_ADMIN: "Super admin",
  SCHOOL_ADMIN: "School admin",
  PRINCIPAL: "Principal",
  TEACHER: "Teacher",
  PARENT: "Parent",
  STUDENT: "Student",
};

const API_ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "Wrong username or password. Try again.",
  PHONE_EXISTS_IN_SCHOOL: "That mobile number is already used at this school.",
  UNAUTHORIZED: "You do not have permission to do that.",
  FORBIDDEN: "You do not have permission to do that.",
  NOT_FOUND: "We could not find that record.",
  VALIDATION_ERROR: "Please check the form and try again.",
};

/** Human-readable label for API enum strings (lesson, quiz, exam, etc.). */
export function formatStatusLabel(status?: string | null): string {
  if (!status) return "—";
  const key = status.trim();
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  return key
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatRoleLabel(role: RoleName): string {
  return ROLE_LABELS[role] ?? formatStatusLabel(role);
}

export function formatRolesList(roles: RoleName[] | undefined): string {
  if (!roles?.length) return "—";
  return roles.map(formatRoleLabel).join(", ");
}

export function isInternalTeacherEmail(email?: string | null): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return lower.endsWith(".teacher.local") || lower.includes("@teacher.");
}

/** Prefer username on profile; hide synthetic login emails. */
export function profileLoginLabel(user: {
  username?: string | null;
  email?: string | null;
}): { label: string; value: string } {
  if (user.username) {
    return { label: "Username", value: user.username };
  }
  if (user.email && !isInternalTeacherEmail(user.email)) {
    return { label: "Email", value: user.email };
  }
  return {
    label: "Sign-in",
    value: "Use the username your school gave you (not your personal email).",
  };
}

export function friendlyApiErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (err && typeof err === "object") {
    const e = err as { name?: string; message?: string; code?: string };
    const code = e.code;
    if (code && API_ERROR_MESSAGES[code]) {
      return API_ERROR_MESSAGES[code];
    }
    const msg = e.message?.trim();
    if (msg && msg !== code && !/^[A-Z][A-Z0-9_]+$/.test(msg)) {
      return msg;
    }
    if (e.name === "ApiClientError") return fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function friendlyApiErrorFromBody(
  code?: string,
  message?: string,
  fallback = "An unexpected error occurred",
): string {
  if (code && API_ERROR_MESSAGES[code]) return API_ERROR_MESSAGES[code];
  const msg = message?.trim();
  if (msg && msg !== code && !/^[A-Z][A-Z0-9_]+$/.test(msg)) return msg;
  if (code && API_ERROR_MESSAGES[code]) return API_ERROR_MESSAGES[code];
  return msg || code || fallback;
}
