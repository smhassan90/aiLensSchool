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
  ON_LEAVE: "On leave",
  PAID: "Paid",
  UNPAID: "Unpaid",
  PARTIAL: "Partially paid",
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
  PLANNER_NOT_FOUND: "We could not find that academic planner.",
  TIMETABLE_VERSION_NOT_FOUND: "We could not find that timetable version.",
  LESSON_NOT_FOUND: "We could not find that lesson in the plan.",
  PLANNER_FORBIDDEN: "You do not have access to this planner.",
  RECORD_FORBIDDEN: "You cannot record teaching for this plan.",
  OBSERVATION_FORBIDDEN: "You cannot add this classroom observation.",
  OBSERVATION_LOCKED: "This observation is locked and cannot be changed.",
  BOOK_NOT_ASSIGNED: "Your school does not have access to that library book.",
  SELF_APPROVAL_FORBIDDEN: "You cannot approve your own submission.",
  PLANNER_OVERLAP: "Another planner already exists for this class and subject.",
  PLANNER_VERSION_CONFLICT: "This plan was changed elsewhere. Refresh to see the latest version.",
  VERSION_NOT_EDITABLE: "This version cannot be edited in its current state.",
  WORKING_VERSION_EXISTS: "Finish or withdraw the current draft before starting another.",
  ALREADY_DECIDED: "This version has already been approved or rejected.",
  BASELINE_CHANGED: "The approved plan changed. Start a new revision from the latest version.",
  SLOT_OCCUPIED: "Another lesson is already scheduled in that slot.",
  PLANNER_NOT_DELETABLE: "This planner cannot be deleted.",
  TIMETABLE_VERSION_CONFLICT: "The timetable was updated elsewhere. Refresh and try again.",
  TIMETABLE_VERSION_NOT_EDITABLE: "This timetable version cannot be edited.",
  IMPORT_ALREADY_PUBLISHED: "This timetable import was already published.",
  CALENDAR_DAY_EXISTS: "A calendar entry already exists for that date.",
  CHAPTER_NOT_ANALYZED: "Analyze every chapter before generating lessons, or use Generate schedule to analyze remaining chapters automatically.",
  TIMETABLE_REQUIRED: "A published timetable is required for this class.",
  DEPENDENCY_VIOLATION: "This move breaks lesson order. Check prerequisite lessons.",
  SLOT_NOT_AVAILABLE: "That slot is not available on the teaching calendar.",
  FROZEN_LESSON: "This lesson is frozen and cannot be moved.",
  EXAM_DATE_INVALID: "Choose an exam date within the school year, after the start date.",
  START_DATE_INVALID: "The start date cannot be before today.",
  RISK_ACKNOWLEDGEMENT_REQUIRED: "Acknowledge the schedule risk before continuing.",
  CONFIRMATION_REQUIRED: "Confirm this action before continuing.",
  COVERAGE_VIOLATION: "Required chapter content would not be covered before the exam.",
  RECORD_FUTURE_DATE: "Teaching records cannot be saved for a future date.",
  RECORD_LESSON_INVALID: "That lesson is not part of the published plan.",
  RECORD_PLANNER_NOT_PUBLISHED: "Teaching records require a published planner.",
  TIMETABLE_INVALID: "Fix timetable issues before publishing.",
  TIMETABLE_EFFECTIVE_DATE_INVALID: "Choose a valid effective date for the timetable.",
  RECOVERY_NOT_NEEDED: "No recovery proposal is needed for this plan.",
  UNSUPPORTED_TIMETABLE_FORMAT: "That file format is not supported for timetable import.",
  COMMENT_REQUIRED: "Enter a comment before continuing.",
  AI_ANALYSIS_FAILED: "Chapter analysis failed. Try again or enter details manually.",
  TIMETABLE_EXTRACTION_FAILED: "Could not read the timetable from that file.",
  CLASS_SUBJECT_NOT_FOUND: "This subject is not assigned to the selected section.",
  SECTION_NOT_FOUND: "Section not found.",
  SUBJECT_NOT_FOUND: "Subject not found.",
  ACADEMIC_YEAR_NOT_FOUND: "No current academic year is configured.",
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
