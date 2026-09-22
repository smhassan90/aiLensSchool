"use client";

import type { Quiz, QuizQuestion } from "@/lib/types";
import { SchoolLetterhead } from "@/components/brand/school-letterhead";
import { examPaperLabel } from "@/lib/exam-paper";
import { personFullName } from "@/lib/person-name";

function answerForQuestion(question: QuizQuestion) {
  if (question.correctAnswer?.trim()) return question.correctAnswer.trim();
  const correct = question.options?.find((opt) => opt.isCorrect);
  return correct?.optionText?.trim() ?? "—";
}

export function ExamSolutionSheet({ quiz }: { quiz: Quiz }) {
  const included = (quiz.questions ?? []).filter((q) => q.included !== false);
  const classLabel = [quiz.section?.grade?.name, quiz.section?.name].filter(Boolean).join(" ");
  const schoolName = quiz.school?.name?.trim() || "School";

  return (
    <div className="exam-solution mx-auto max-w-2xl bg-white p-6 text-black print:max-w-none print:p-0">
      <header className="border-b border-black pb-3 text-center">
        <SchoolLetterhead name={schoolName} logo={quiz.school?.logo} titleClassName="text-lg" />
        <p className="mt-1 text-sm font-semibold">Answer key — {examPaperLabel(quiz.paperKind)}</p>
        <p className="text-xs text-neutral-700">
          {quiz.subject?.name ?? "Subject"}
          {classLabel ? ` · ${classLabel}` : ""}
          {quiz.difficulty ? ` · Difficulty ${quiz.difficulty}/10` : ""}
        </p>
        {quiz.createdBy ? (
          <p className="mt-1 text-xs text-neutral-600">
            {personFullName(quiz.createdBy.firstName, quiz.createdBy.lastName)}
          </p>
        ) : null}
      </header>
      <ol className="mt-4 columns-1 gap-x-8 text-sm sm:columns-2">
        {included.map((question, index) => (
          <li key={question.id} className="mb-2 break-inside-avoid">
            <span className="font-semibold">{index + 1}.</span> {answerForQuestion(question)}
          </li>
        ))}
      </ol>
    </div>
  );
}
