import { Quiz, QuizResult } from '@/types/api';

export function isQuizAccessible(
  quiz: Quiz,
  options?: { hasResult?: boolean; now?: Date },
): boolean {
  const now = options?.now ?? new Date();
  if (options?.hasResult) return true;
  if (!quiz.dueAt) return true;
  return new Date(quiz.dueAt) > now;
}

export function filterAccessibleQuizzes(
  quizzes: Quiz[],
  resultsByQuiz: Map<string, QuizResult>,
  now?: Date,
): Quiz[] {
  return quizzes.filter((quiz) =>
    isQuizAccessible(quiz, { hasResult: resultsByQuiz.has(quiz.id), now }),
  );
}

export function pendingQuizzes(
  quizzes: Quiz[],
  resultsByQuiz: Map<string, QuizResult>,
  now?: Date,
): Quiz[] {
  return filterAccessibleQuizzes(quizzes, resultsByQuiz, now).filter(
    (quiz) => !resultsByQuiz.has(quiz.id),
  );
}
