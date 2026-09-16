import { QuestionType } from '@prisma/client';

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

export function parseQuestionSpec(value: unknown): ExamPaperQuestionSpec | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const spec: ExamPaperQuestionSpec = {
    mcqCount: Number(row.mcqCount) || 0,
    fillBlankCount: Number(row.fillBlankCount) || 0,
    trueFalseCount: Number(row.trueFalseCount) || 0,
    shortAnswerCount: Number(row.shortAnswerCount) || 0,
    longAnswerCount: Number(row.longAnswerCount) || 0,
    mcqMarks: Number(row.mcqMarks) || 0,
    fillBlankMarks: Number(row.fillBlankMarks) || 0,
    trueFalseMarks: Number(row.trueFalseMarks) || 0,
    shortAnswerMarks: Number(row.shortAnswerMarks) || 0,
    longAnswerMarks: Number(row.longAnswerMarks) || 0,
  };
  if (totalQuestionsFromSpec(spec) < 1) return null;
  return spec;
}

export function validateQuestionSpec(spec: ExamPaperQuestionSpec, maxMarks: number): string | null {
  if (totalQuestionsFromSpec(spec) < 1) {
    return 'Set at least one question in the exam requirements';
  }
  const total = totalMarksFromSpec(spec);
  if (total !== maxMarks) {
    return `Question section marks must add up to ${maxMarks} (currently ${total})`;
  }
  return null;
}

const TYPE_TO_SPEC: Record<QuestionType, keyof ExamPaperQuestionSpec> = {
  MCQ: 'mcqCount',
  FILL_IN_THE_BLANK: 'fillBlankCount',
  TRUE_FALSE: 'trueFalseCount',
  SHORT_ANSWER: 'shortAnswerCount',
  LONG_ANSWER: 'longAnswerCount',
};

const TYPE_TO_MARKS: Record<QuestionType, keyof ExamPaperQuestionSpec> = {
  MCQ: 'mcqMarks',
  FILL_IN_THE_BLANK: 'fillBlankMarks',
  TRUE_FALSE: 'trueFalseMarks',
  SHORT_ANSWER: 'shortAnswerMarks',
  LONG_ANSWER: 'longAnswerMarks',
};

export function validatePaperAgainstSpec(
  questions: Array<{ type: QuestionType; marks: number | string; included?: boolean }>,
  spec: ExamPaperQuestionSpec,
): string | null {
  const included = questions.filter((q) => q.included !== false);
  const counts: Record<QuestionType, number> = {
    MCQ: 0,
    FILL_IN_THE_BLANK: 0,
    TRUE_FALSE: 0,
    SHORT_ANSWER: 0,
    LONG_ANSWER: 0,
  };
  const marks: Record<QuestionType, number> = {
    MCQ: 0,
    FILL_IN_THE_BLANK: 0,
    TRUE_FALSE: 0,
    SHORT_ANSWER: 0,
    LONG_ANSWER: 0,
  };

  for (const question of included) {
    counts[question.type] += 1;
    marks[question.type] += Number(question.marks) || 0;
  }

  for (const type of Object.keys(counts) as QuestionType[]) {
    const requiredCount = spec[TYPE_TO_SPEC[type]];
    if (counts[type] !== requiredCount) {
      const label = type.replace(/_/g, ' ').toLowerCase();
      return `Expected exactly ${requiredCount} ${label} question${requiredCount === 1 ? '' : 's'}, but the paper has ${counts[type]}`;
    }
    const requiredMarks = spec[TYPE_TO_MARKS[type]];
    if (Math.round(marks[type] * 100) !== requiredMarks * 100) {
      const label = type.replace(/_/g, ' ').toLowerCase();
      return `${label} section marks must be exactly ${requiredMarks}, but the paper has ${marks[type]}`;
    }
  }

  return null;
}
