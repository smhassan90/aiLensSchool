export const EXAM_PAPER_KINDS = ["ASSESSMENT", "MID_TERM", "FINAL_TERM"] as const;

export type ExamPaperKind = (typeof EXAM_PAPER_KINDS)[number];

export function isExamPaper(kind?: string | null) {
  return EXAM_PAPER_KINDS.includes(kind as ExamPaperKind);
}

export function examPaperLabel(kind?: string | null) {
  switch (kind) {
    case "ASSESSMENT":
      return "Assessment";
    case "MID_TERM":
      return "Mid term";
    case "FINAL_TERM":
      return "Final term";
    default:
      return "Exam";
  }
}

export type TeacherExamPaperStatus = "NOT_STARTED" | "DRAFT" | "PENDING" | "APPROVED";

export function teacherExamPaperStatus(input?: {
  status?: string;
  reviewStatus?: string | null;
} | null): TeacherExamPaperStatus {
  if (!input?.status) return "NOT_STARTED";
  if (input.reviewStatus === "APPROVED") return "APPROVED";
  if (input.reviewStatus === "PENDING_REVIEW") return "PENDING";
  if (input.status === "DRAFT") return "DRAFT";
  if (input.status === "CLOSED") return "PENDING";
  return "DRAFT";
}

export function teacherExamPaperStatusLabel(status: TeacherExamPaperStatus) {
  switch (status) {
    case "NOT_STARTED":
      return "Not started";
    case "DRAFT":
      return "Draft";
    case "PENDING":
      return "Pending approval";
    case "APPROVED":
      return "Approved";
    default:
      return status;
  }
}

export function teacherExamPaperStatusVariant(
  status: TeacherExamPaperStatus,
): "default" | "secondary" | "warning" | "success" | "destructive" {
  switch (status) {
    case "APPROVED":
      return "success";
    case "PENDING":
      return "warning";
    case "DRAFT":
      return "secondary";
    default:
      return "default";
  }
}

export function canEditTeacherExamPaper(input?: {
  status?: string;
  reviewStatus?: string | null;
} | null) {
  return teacherExamPaperStatus(input) === "DRAFT" || teacherExamPaperStatus(input) === "NOT_STARTED";
}

export function canPrintTeacherExamPaper(input?: {
  status?: string;
  reviewStatus?: string | null;
} | null) {
  return teacherExamPaperStatus(input) === "APPROVED";
}

export function examStatusLabel(
  status?: string,
  paperKind?: string | null,
  reviewStatus?: string | null,
) {
  if (isExamPaper(paperKind)) {
    const teacherStatus = teacherExamPaperStatus({ status, reviewStatus });
    if (teacherStatus !== "NOT_STARTED") {
      return teacherExamPaperStatusLabel(teacherStatus);
    }
  }
  if (status === "DRAFT") return "Draft";
  return status?.replaceAll("_", " ") ?? "—";
}
