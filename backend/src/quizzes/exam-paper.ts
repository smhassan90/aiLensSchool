export const EXAM_PAPER_KINDS = ['ASSESSMENT', 'MID_TERM', 'FINAL_TERM'] as const;

export type ExamPaperKind = (typeof EXAM_PAPER_KINDS)[number];

export function isExamPaperKind(value?: string | null): value is ExamPaperKind {
  return EXAM_PAPER_KINDS.includes(value as ExamPaperKind);
}

export function examPaperLabel(kind?: string | null) {
  switch (kind) {
    case 'ASSESSMENT':
      return 'Assessment';
    case 'MID_TERM':
      return 'Mid term';
    case 'FINAL_TERM':
      return 'Final term';
    default:
      return 'Exam';
  }
}
