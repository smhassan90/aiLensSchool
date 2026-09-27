import { randomUUID } from 'crypto';
import { normalizeGeneratedQuestion } from '../ai/quiz-mix';
import type { QuizQuestionOutput } from '../ai/schemas/quiz-output.schema';
import { isMathScienceSubjectName } from '../common/math-lesson-text';

export type HomeworkQuestionItem = {
  id: string;
  type: 'MCQ' | 'FILL_IN_THE_BLANK' | 'TRUE_FALSE';
  questionText: string;
  marks: number;
  correctAnswer: string;
  options?: Array<{ id: string; optionText: string; isCorrect: boolean }>;
};

const MCQ_LABELS = ['A', 'B', 'C', 'D'];

export function isMathSubject(subjectName?: string | null): boolean {
  const name = (subjectName ?? '').toLowerCase();
  return isMathScienceSubjectName(subjectName) || /maths|numeracy|ریاضی|arithmetic/.test(name);
}

export function singleWordFillAnswer(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const first = trimmed.split(/\s+/)[0] ?? '';
  return first.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function stripOptionLabel(optionText: string): string {
  return optionText.trim().replace(/^[A-D][.)]\s*/i, '').trim();
}

export function labelMcqOptionsAbcd(
  options: Array<{ id: string; optionText: string; isCorrect: boolean }>,
): Array<{ id: string; optionText: string; isCorrect: boolean }> {
  const trimmed = options.slice(0, 4);
  while (trimmed.length < 4) {
    trimmed.push({
      id: randomUUID(),
      optionText: `${MCQ_LABELS[trimmed.length]}) —`,
      isCorrect: false,
    });
  }
  return trimmed.map((opt, index) => {
    const letter = MCQ_LABELS[index];
    const body = stripOptionLabel(opt.optionText) || '—';
    return { ...opt, optionText: `${letter}) ${body}` };
  });
}

function polishHomeworkQuestion(
  question: HomeworkQuestionItem,
  subjectName?: string,
): HomeworkQuestionItem | null {
  const q = { ...question };

  if (q.type === 'FILL_IN_THE_BLANK') {
    const word = singleWordFillAnswer(q.correctAnswer);
    if (!word) return null;
    q.correctAnswer = word;
    if (!/_____/.test(q.questionText)) {
      q.questionText = `${q.questionText.trim()} _____`;
    }
  }

  if (q.type === 'MCQ') {
    if (!q.options?.length) return null;
    q.options = labelMcqOptionsAbcd(q.options);
    const correct = q.options.find((o) => o.isCorrect);
    q.correctAnswer = correct ? stripOptionLabel(correct.optionText) : q.correctAnswer;
    if (isMathSubject(subjectName) && q.options.length < 4) {
      return null;
    }
  }

  return q.questionText && q.correctAnswer ? q : null;
}

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
  options?: { subjectName?: string },
): HomeworkQuestionItem[] {
  const subjectName = options?.subjectName;
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

  const built = source.map((item, index) => {
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
    const type: HomeworkQuestionItem['type'] =
      normalized.type === 'MCQ' || normalized.type === 'TRUE_FALSE' || normalized.type === 'FILL_IN_THE_BLANK'
        ? normalized.type
        : 'FILL_IN_THE_BLANK';
    const built: HomeworkQuestionItem = {
      id: randomUUID(),
      type,
      questionText: normalized.questionText,
      marks: Number(normalized.marks) || 1,
      correctAnswer:
        (normalized.correctAnswer ?? '').trim() ||
        stripOptionLabel(options.find((o) => o.isCorrect)?.optionText ?? '') ||
        '',
      options: options.length ? options : undefined,
    };
    const polished = polishHomeworkQuestion(built, subjectName);
    return polished;
  }).filter((q): q is HomeworkQuestionItem => Boolean(q));

  return built;
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

export type HomeworkResultAnswerRow = HomeworkAnswerItem & {
  question?: {
    id: string;
    questionText: string;
    type: string;
    marks: number;
    correctAnswer: string;
  };
};

export function enrichHomeworkResultAnswers(
  questions: HomeworkQuestionItem[],
  answerRows: HomeworkAnswerItem[],
): HomeworkResultAnswerRow[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  return answerRows.map((row) => {
    const question = byId.get(row.questionId);
    return {
      ...row,
      question: question
        ? {
            id: question.id,
            questionText: question.questionText,
            type: question.type,
            marks: question.marks,
            correctAnswer: question.correctAnswer,
          }
        : undefined,
    };
  });
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
