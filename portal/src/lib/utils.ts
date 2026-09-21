import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Calendar date in the user's local timezone (YYYY-MM-DD). Avoids UTC off-by-one. */
export function localDateISO(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local calendar date plus N days (YYYY-MM-DD). */
export function localDateISOPlusDays(days: number, from = new Date()): string {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return localDateISO(date);
}

/** Format marks with at most one decimal place (fixes float display like 17.000000000000004). */
export function formatMarks(value?: number | string | null): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 10) / 10;
  return rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(1);
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
    case "LONG_ANSWER":
      return "Long answer";
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

type SectionLike = {
  name?: string | null;
  grade?: { name?: string | null; level?: number | null } | null;
} | null;

export function parseClassNumber(value?: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/(?:class|grade|level)\s*(\d+)/i);
  if (match) {
    const num = Number(match[1]);
    return Number.isFinite(num) ? num : null;
  }
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

export function gradeClassNumber(section?: SectionLike): number | null {
  if (!section?.grade) return null;
  return parseClassNumber(section.grade.name);
}

/** Grade / class only, e.g. "Class 8". Section letter is excluded. */
export function gradeClassLabel(section?: SectionLike): string {
  if (!section) return "—";
  const classNumber = gradeClassNumber(section);
  if (classNumber != null) return `Class ${classNumber}`;
  const gradeName = section.grade?.name?.trim() ?? "";
  if (gradeName) return gradeName;
  return "—";
}

/** Full label including section, e.g. "Class 4 A" or "Level 1 A". */
export function sectionClassLabel(section?: SectionLike): string {
  if (!section) return "—";
  const gradeName = section.grade?.name?.trim() ?? "";
  const name = section.name?.trim() ?? "";
  if (gradeName && name) return `${gradeName} ${name}`;
  if (gradeName) return gradeName;
  return name || "—";
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
