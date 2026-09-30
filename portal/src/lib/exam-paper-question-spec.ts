export interface ExamPaperQuestionSpec {
  mcqCount: number;
  fillBlankCount: number;
  trueFalseCount: number;
  shortAnswerCount: number;
  longAnswerCount: number;
  /** Marks per MCQ question */
  mcqMarks: number;
  /** Marks per fill-in-the-blank question */
  fillBlankMarks: number;
  /** Marks per true/false question */
  trueFalseMarks: number;
  /** Marks per short-answer question */
  shortAnswerMarks: number;
  /** Marks per long-answer question */
  longAnswerMarks: number;
}

export const defaultQuestionSpec: ExamPaperQuestionSpec = {
  mcqCount: 8,
  fillBlankCount: 3,
  trueFalseCount: 5,
  shortAnswerCount: 3,
  longAnswerCount: 1,
  mcqMarks: 1,
  fillBlankMarks: 1,
  trueFalseMarks: 1,
  shortAnswerMarks: 2,
  longAnswerMarks: 5,
};

export function sectionMarksFromSpec(spec: ExamPaperQuestionSpec): {
  mcq: number;
  fillBlank: number;
  trueFalse: number;
  shortAnswer: number;
  longAnswer: number;
} {
  return {
    mcq: spec.mcqCount * spec.mcqMarks,
    fillBlank: spec.fillBlankCount * spec.fillBlankMarks,
    trueFalse: spec.trueFalseCount * spec.trueFalseMarks,
    shortAnswer: spec.shortAnswerCount * spec.shortAnswerMarks,
    longAnswer: spec.longAnswerCount * spec.longAnswerMarks,
  };
}

export function totalMarksFromSpec(spec: ExamPaperQuestionSpec): number {
  const s = sectionMarksFromSpec(spec);
  return s.mcq + s.fillBlank + s.trueFalse + s.shortAnswer + s.longAnswer;
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

/** Suggested starting question mix for teachers, scaled toward the office-assigned total marks. */
export function buildQuestionSpecForMarks(maxMarks: number): ExamPaperQuestionSpec {
  const base = defaultQuestionSpec;
  const baseTotal = totalMarksFromSpec(base);
  if (maxMarks <= 0) return { ...base };
  if (maxMarks === baseTotal) return { ...base };

  const factor = maxMarks / baseTotal;
  const scale = (marks: number) => Math.max(0.5, Math.round(marks * factor * 100) / 100);
  const spec: ExamPaperQuestionSpec = {
    ...base,
    mcqMarks: scale(base.mcqMarks),
    fillBlankMarks: scale(base.fillBlankMarks),
    trueFalseMarks: scale(base.trueFalseMarks),
    shortAnswerMarks: scale(base.shortAnswerMarks),
    longAnswerMarks: scale(base.longAnswerMarks),
  };
  const drift = maxMarks - totalMarksFromSpec(spec);
  if (drift !== 0 && spec.longAnswerCount > 0) {
    spec.longAnswerMarks = Math.max(
      0.5,
      Math.round((spec.longAnswerMarks + drift / spec.longAnswerCount) * 100) / 100,
    );
  }
  return spec;
}
