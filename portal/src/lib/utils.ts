import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value?: string | Date | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function quizOptionLabel(opt: { optionText?: string } | string | null | undefined): string {
  if (!opt) return "";
  if (typeof opt === "string") return opt;
  return opt.optionText ?? "";
}

export function quizQuestionTypeLabel(type?: string): string {
  switch (type) {
    case "MCQ":
      return "Multiple choice";
    case "TRUE_FALSE":
      return "True / False";
    case "FILL_IN_THE_BLANK":
      return "Fill in the blank";
    case "SHORT_ANSWER":
      return "Short answer";
    default:
      return type?.replace(/_/g, " ") ?? "Question";
  }
}

export function quizCorrectAnswer(question: {
  type?: string;
  correctAnswer?: string | null;
  options?: Array<{ optionText?: string; isCorrect?: boolean } | string> | null;
}): string {
  const marked = (question.options ?? []).find((opt) => typeof opt !== "string" && opt.isCorrect);
  if (marked) return quizOptionLabel(marked).trim();
  const stored = question.correctAnswer?.trim() ?? "";
  if (stored) return stored;
  return "";
}

export function isQuizOptionCorrect(
  opt: { optionText?: string; isCorrect?: boolean } | string,
  correctAnswer: string,
): boolean {
  if (typeof opt !== "string" && opt.isCorrect) return true;
  const label = quizOptionLabel(opt).trim();
  return Boolean(label && correctAnswer && label.toLowerCase() === correctAnswer.toLowerCase());
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
