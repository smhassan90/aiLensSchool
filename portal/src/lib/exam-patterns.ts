export const EXAM_PATTERN_IDS = ["MID_FINAL", "THREE_TERMS", "ASSESSMENTS_MID_FINAL", "TPS", "CUSTOM"] as const;

export type ExamPatternId = (typeof EXAM_PATTERN_IDS)[number];

export type ExamPaperDef = {
  name: string;
  maxMarks: number;
  sequence: number;
  startDate?: string;
  endDate?: string;
};

export type DraftExamPaper = {
  key: string;
  name: string;
  maxMarks: number;
  startDate?: string;
  endDate?: string;
};

export const EXAM_PATTERN_PAPERS: Record<Exclude<ExamPatternId, "CUSTOM">, ExamPaperDef[]> = {
  MID_FINAL: [
    { name: "Mid term", maxMarks: 50, sequence: 1 },
    { name: "Final term", maxMarks: 100, sequence: 2 },
  ],
  THREE_TERMS: [
    { name: "First term", maxMarks: 100, sequence: 1 },
    { name: "Second term", maxMarks: 100, sequence: 2 },
    { name: "Third term", maxMarks: 100, sequence: 3 },
  ],
  ASSESSMENTS_MID_FINAL: [
    { name: "1st Assessment", maxMarks: 50, sequence: 1 },
    { name: "2nd Assessment", maxMarks: 50, sequence: 2 },
    { name: "Mid term", maxMarks: 50, sequence: 3 },
    { name: "3rd Assessment", maxMarks: 50, sequence: 4 },
    { name: "4th Assessment", maxMarks: 50, sequence: 5 },
    { name: "Final Term", maxMarks: 100, sequence: 6 },
  ],
  TPS: [
    { name: "Preliminary Exams", maxMarks: 550, sequence: 1 },
    { name: "Final Term Examination", maxMarks: 800, sequence: 2 },
  ],
};

export const EXAM_PATTERN_OPTIONS: Array<{ value: Exclude<ExamPatternId, "CUSTOM">; label: string }> = [
  {
    value: "ASSESSMENTS_MID_FINAL",
    label: "1st–4th Assessment, Mid term, Final Term",
  },
  { value: "MID_FINAL", label: "Mid term and Final" },
  { value: "THREE_TERMS", label: "First, second, third term" },
  { value: "TPS", label: "Preliminary exams and Final Term Examination" },
];

export function toDateInput(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

export function createDraftPaper(
  name: string,
  maxMarks: number,
  dates?: { startDate?: string | null; endDate?: string | null },
): DraftExamPaper {
  return {
    key: `paper-${Math.random().toString(36).slice(2, 10)}`,
    name,
    maxMarks,
    startDate: toDateInput(dates?.startDate),
    endDate: toDateInput(dates?.endDate),
  };
}

export function draftsFromPapers(papers: ExamPaperDef[]): DraftExamPaper[] {
  return papers.map((paper) => createDraftPaper(paper.name, paper.maxMarks));
}

export function defaultExamDrafts(): DraftExamPaper[] {
  return draftsFromPapers(EXAM_PATTERN_PAPERS.ASSESSMENTS_MID_FINAL);
}

export function toExamPayload(papers: DraftExamPaper[]): ExamPaperDef[] {
  return papers
    .map((paper) => ({
      name: paper.name.trim(),
      maxMarks: Number(paper.maxMarks) || 0,
      startDate: paper.startDate?.trim() || undefined,
      endDate: paper.endDate?.trim() || undefined,
    }))
    .filter((paper) => paper.name)
    .map((paper, index) => ({
      name: paper.name,
      maxMarks: paper.maxMarks > 0 ? paper.maxMarks : 50,
      sequence: index + 1,
      ...(paper.startDate ? { startDate: paper.startDate } : {}),
      ...(paper.endDate ? { endDate: paper.endDate } : {}),
    }));
}

export function ordinal(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

export function nextAssessmentName(papers: DraftExamPaper[]): string {
  const count = papers.filter((paper) => /assessment/i.test(paper.name)).length;
  return `${ordinal(count + 1)} Assessment`;
}

export function isMidTerm(name: string): boolean {
  return /^mid(\s|-)?term$/i.test(name.trim());
}

export function isFinalTerm(name: string): boolean {
  return /^final(\s|-)?term$/i.test(name.trim());
}

export function insertIndexForAssessment(papers: DraftExamPaper[]): number {
  const finalIndex = papers.findIndex((paper) => isFinalTerm(paper.name));
  return finalIndex >= 0 ? finalIndex : papers.length;
}
