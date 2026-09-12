import { randomUUID } from 'crypto';
import { normalizeGeneratedQuestion } from '../ai/quiz-mix';
import type { QuizQuestionOutput } from '../ai/schemas/quiz-output.schema';

export type HomeworkQuestionItem = {
  id: string;
  type: 'MCQ' | 'FILL_IN_THE_BLANK' | 'TRUE_FALSE';
  questionText: string;
  marks: number;
  correctAnswer: string;
  options?: Array<{ id: string; optionText: string; isCorrect: boolean }>;
};

export type HomeworkAnswerItem = {
  questionId: string;
  optionId?: string | null;
  answerText?: string | null;
  isCorrect: boolean;
  marksAwarded: number;
};

export function buildHomeworkQuestions(
  raw: Array<Partial<QuizQuestionOutput> & { questionText?: string }> | undefined,
  fallbackPoints: string[],
): HomeworkQuestionItem[] {
  const source =
    raw?.length && raw.some((q) => (q.questionText ?? '').trim())
      ? raw
      : fallbackPoints.slice(0, 5).map((point, i) => ({
          type: 'TRUE_FALSE' as const,
          questionText: `${point} — True or False?`,
          marks: 1,
          correctAnswer: 'TRUE',
          options: [
            { optionText: 'TRUE', isCorrect: true },
            { optionText: 'FALSE', isCorrect: false },
          ],
        }));

  return source.map((item, index) => {
    const normalized = normalizeGeneratedQuestion({
      type: (item.type as QuizQuestionOutput['type']) || 'FILL_IN_THE_BLANK',
      questionText: (item.questionText ?? `Question ${index + 1}`).trim(),
      marks: Number(item.marks) > 0 ? Number(item.marks) : 1,
      correctAnswer: item.correctAnswer ?? '',
      options: item.options,
    });
    const options = (normalized.options ?? []).map((opt) => ({
      id: randomUUID(),
      optionText: opt.optionText,
      isCorrect: Boolean(opt.isCorrect),
    }));
    return {
      id: randomUUID(),
      type: normalized.type === 'SHORT_ANSWER' ? 'FILL_IN_THE_BLANK' : normalized.type,
      questionText: normalized.questionText,
      marks: Number(normalized.marks) || 1,
      correctAnswer: (normalized.correctAnswer ?? '').trim() || options.find((o) => o.isCorrect)?.optionText || '',
      options: options.length ? options : undefined,
    };
  }).filter((q) => q.questionText && q.correctAnswer);
}

export function descriptionFromQuestions(questions: HomeworkQuestionItem[]): string {
  return questions.map((q, i) => `${i + 1}. ${q.questionText}`).join('\n');
}

export function answerKeyFromQuestions(questions: HomeworkQuestionItem[]): string {
  return questions.map((q, i) => `${i + 1}. ${q.correctAnswer}`).join('\n');
}

export function scoreHomeworkAnswers(
  questions: HomeworkQuestionItem[],
  answers: Array<{ questionId: string; optionId?: string; answerText?: string }>,
): { score: number; totalMarks: number; percentage: number; answerRows: HomeworkAnswerItem[] } {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  let score = 0;
  const totalMarks = questions.reduce((sum, q) => sum + Number(q.marks), 0);
  const answerRows = questions.map((question) => {
    const given = byId.get(question.id);
    const selected = given?.optionId
      ? question.options?.find((o) => o.id === given.optionId)
      : undefined;
    const text = (given?.answerText ?? selected?.optionText ?? '').trim();
    let isCorrect = false;
    if (question.type === 'MCQ' || question.type === 'TRUE_FALSE') {
      isCorrect = Boolean(selected?.isCorrect);
      if (!isCorrect && text && question.correctAnswer) {
        isCorrect = text.toLowerCase() === question.correctAnswer.trim().toLowerCase();
      }
    } else if (question.correctAnswer) {
      isCorrect = text.toLowerCase() === question.correctAnswer.trim().toLowerCase();
    }
    const marksAwarded = isCorrect ? Number(question.marks) : 0;
    score += marksAwarded;
    return {
      questionId: question.id,
      optionId: selected?.id ?? null,
      answerText: text || null,
      isCorrect,
      marksAwarded,
    };
  });
  const percentage = totalMarks > 0 ? Number(((score / totalMarks) * 100).toFixed(2)) : 0;
  return { score, totalMarks, percentage, answerRows };
}

export function stripAnswersFromQuestions(questions: HomeworkQuestionItem[]): Array<{
  id: string;
  type: string;
  questionText: string;
  marks: number;
  options?: Array<{ id: string; optionText: string }>;
}> {
  return questions.map((q) => ({
    id: q.id,
    type: q.type,
    questionText: q.questionText,
    marks: q.marks,
    options: q.options?.map((o) => ({ id: o.id, optionText: o.optionText })),
  }));
}
