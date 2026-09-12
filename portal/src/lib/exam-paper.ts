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

export function examStatusLabel(status?: string, paperKind?: string | null) {
  if (isExamPaper(paperKind) && status === "CLOSED") return "Submitted for print";
  if (status === "DRAFT") return "Draft";
  return status?.replaceAll("_", " ") ?? "—";
}
