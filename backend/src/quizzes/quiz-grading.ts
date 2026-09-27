import { QuestionType } from '@prisma/client';

export type GradingOption = {
  id: string;
  optionText: string;
  isCorrect: boolean;
};

export type GradingQuestion = {
  type: QuestionType;
  correctAnswer: string | null;
  options: GradingOption[];
};

export type GradingAnswer = {
  optionId?: string | null;
  answerText?: string | null;
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeTrueFalseAnswer(value: string): 'TRUE' | 'FALSE' | null {
  const v = value.trim().toLowerCase();
  if (v === 'true' || v === 't' || v === 'yes') return 'TRUE';
  if (v === 'false' || v === 'f' || v === 'no') return 'FALSE';
  return null;
}

function expectedTrueFalse(question: GradingQuestion): 'TRUE' | 'FALSE' | null {
  const fromAnswer = normalizeTrueFalseAnswer(question.correctAnswer ?? '');
  if (fromAnswer) return fromAnswer;
  const correctOption = question.options.find((opt) => opt.isCorrect);
  if (correctOption) return normalizeTrueFalseAnswer(correctOption.optionText);
  return null;
}

function studentTrueFalse(given: GradingAnswer, selected?: GradingOption): 'TRUE' | 'FALSE' | null {
  const fromText = normalizeTrueFalseAnswer(given.answerText ?? '');
  if (fromText) return fromText;
  if (selected) return normalizeTrueFalseAnswer(selected.optionText);
  return null;
}

export function gradeQuizAnswer(question: GradingQuestion, given: GradingAnswer): boolean {
  const text = given.answerText?.trim() ?? '';
  const selected = given.optionId
    ? question.options.find((option) => option.id === given.optionId)
    : undefined;

  if (question.type === QuestionType.TRUE_FALSE) {
    const expected = expectedTrueFalse(question);
    const student = studentTrueFalse(given, selected);
    if (expected && student) return expected === student;
    if (selected?.isCorrect) return true;
    if (selected && expected) {
      return normalizeTrueFalseAnswer(selected.optionText) === expected;
    }
    return false;
  }

  if (question.type === QuestionType.MCQ) {
    if (selected?.isCorrect) return true;
    const correctOption = question.options.find((opt) => opt.isCorrect);
    if (selected && correctOption) {
      return normalizeText(selected.optionText) === normalizeText(correctOption.optionText);
    }
    if (text && question.correctAnswer) {
      return normalizeText(text) === normalizeText(question.correctAnswer);
    }
    return false;
  }

  if (question.type === QuestionType.FILL_IN_THE_BLANK) {
    if (!question.correctAnswer?.trim()) return false;
    return normalizeText(text) === normalizeText(question.correctAnswer);
  }

  if (question.correctAnswer?.trim() && text) {
    return normalizeText(text) === normalizeText(question.correctAnswer);
  }

  return false;
}
