export interface ExamPaperQuestionSpec {
  mcqCount: number;
  fillBlankCount: number;
  trueFalseCount: number;
  shortAnswerCount: number;
  longAnswerCount: number;
  mcqMarks: number;
  fillBlankMarks: number;
  trueFalseMarks: number;
  shortAnswerMarks: number;
  longAnswerMarks: number;
}

export const defaultQuestionSpec: ExamPaperQuestionSpec = {
  mcqCount: 8,
  fillBlankCount: 3,
  trueFalseCount: 5,
  shortAnswerCount: 3,
  longAnswerCount: 1,
  mcqMarks: 16,
  fillBlankMarks: 6,
  trueFalseMarks: 5,
  shortAnswerMarks: 12,
  longAnswerMarks: 8,
};

export function totalMarksFromSpec(spec: ExamPaperQuestionSpec): number {
  return (
    spec.mcqMarks +
    spec.fillBlankMarks +
    spec.trueFalseMarks +
    spec.shortAnswerMarks +
    spec.longAnswerMarks
  );
}

export function totalQuestionsFromSpec(spec: ExamPaperQuestionSpec): number {
  return (
    spec.mcqCount +
    spec.fillBlankCount +
    spec.trueFalseCount +
    spec.shortAnswerCount +
    spec.longAnswerCount
  );
}

/** Default question mix scaled to the exam's total marks (used when admin only sets due dates). */
export function buildQuestionSpecForMarks(maxMarks: number): ExamPaperQuestionSpec {
  const base = defaultQuestionSpec;
  const baseTotal = totalMarksFromSpec(base);
  if (maxMarks <= 0) return { ...base };
  if (maxMarks === baseTotal) return { ...base };

  const scaled = {
    mcqMarks: Math.round((base.mcqMarks / baseTotal) * maxMarks),
    fillBlankMarks: Math.round((base.fillBlankMarks / baseTotal) * maxMarks),
    trueFalseMarks: Math.round((base.trueFalseMarks / baseTotal) * maxMarks),
    shortAnswerMarks: Math.round((base.shortAnswerMarks / baseTotal) * maxMarks),
    longAnswerMarks: Math.round((base.longAnswerMarks / baseTotal) * maxMarks),
  };
  const sum =
    scaled.mcqMarks +
    scaled.fillBlankMarks +
    scaled.trueFalseMarks +
    scaled.shortAnswerMarks +
    scaled.longAnswerMarks;
  scaled.longAnswerMarks += maxMarks - sum;

  return {
    mcqCount: base.mcqCount,
    fillBlankCount: base.fillBlankCount,
    trueFalseCount: base.trueFalseCount,
    shortAnswerCount: base.shortAnswerCount,
    longAnswerCount: base.longAnswerCount,
    ...scaled,
  };
}
