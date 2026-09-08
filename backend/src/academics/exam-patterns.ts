export const EXAM_PATTERN_IDS = ['MID_FINAL', 'THREE_TERMS', 'ASSESSMENTS_MID_FINAL', 'TPS', 'CUSTOM'] as const;

export type ExamPatternId = (typeof EXAM_PATTERN_IDS)[number];

export type ExamPaperDef = {
  name: string;
  maxMarks: number;
  sequence: number;
  startDate?: string;
  endDate?: string;
};

export const EXAM_PATTERN_PAPERS: Record<Exclude<ExamPatternId, 'CUSTOM'>, ExamPaperDef[]> = {
  MID_FINAL: [
    { name: 'Mid term', maxMarks: 50, sequence: 1 },
    { name: 'Final term', maxMarks: 100, sequence: 2 },
  ],
  THREE_TERMS: [
    { name: 'First term', maxMarks: 100, sequence: 1 },
    { name: 'Second term', maxMarks: 100, sequence: 2 },
    { name: 'Third term', maxMarks: 100, sequence: 3 },
  ],
  ASSESSMENTS_MID_FINAL: [
    { name: '1st Assessment', maxMarks: 50, sequence: 1 },
    { name: '2nd Assessment', maxMarks: 50, sequence: 2 },
    { name: 'Mid term', maxMarks: 50, sequence: 3 },
    { name: '3rd Assessment', maxMarks: 50, sequence: 4 },
    { name: '4th Assessment', maxMarks: 50, sequence: 5 },
    { name: 'Final Term', maxMarks: 100, sequence: 6 },
  ],
  TPS: [
    { name: 'Preliminary Exams', maxMarks: 550, sequence: 1 },
    { name: 'Final Term Examination', maxMarks: 800, sequence: 2 },
  ],
};

export function isExamPatternId(value: string): value is ExamPatternId {
  return (EXAM_PATTERN_IDS as readonly string[]).includes(value);
}

export function normalizeExamPapers(
  papers: Array<{ name: string; maxMarks: number; sequence?: number; startDate?: string; endDate?: string }>,
): ExamPaperDef[] {
  const seen = new Set<string>();
  return papers
    .map((paper) => ({
      name: paper.name.trim(),
      maxMarks: Number(paper.maxMarks),
      startDate: paper.startDate?.trim() || undefined,
      endDate: paper.endDate?.trim() || undefined,
    }))
    .filter((paper) => paper.name)
    .map((paper, index) => {
      let name = paper.name;
      let suffix = 2;
      while (seen.has(name.toLowerCase())) {
        name = `${paper.name} (${suffix})`;
        suffix += 1;
      }
      seen.add(name.toLowerCase());
      return {
        name,
        maxMarks: paper.maxMarks > 0 ? Math.round(paper.maxMarks) : 50,
        sequence: index + 1,
        ...(paper.startDate ? { startDate: paper.startDate } : {}),
        ...(paper.endDate ? { endDate: paper.endDate } : {}),
      };
    });
}

export function examsForPattern(pattern: string): ExamPaperDef[] {
  if (pattern === 'MID_FINAL' || pattern === 'THREE_TERMS' || pattern === 'ASSESSMENTS_MID_FINAL' || pattern === 'TPS') {
    return EXAM_PATTERN_PAPERS[pattern].map((paper) => ({ ...paper }));
  }
  return EXAM_PATTERN_PAPERS.ASSESSMENTS_MID_FINAL.map((paper) => ({ ...paper }));
}
