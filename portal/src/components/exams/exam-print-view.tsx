"use client";

import { examPaperLabel } from "@/lib/exam-paper";
import type { Quiz, QuizQuestion } from "@/lib/types";
import { formatMarks, quizOptionLabel, quizQuestionTypeLabel } from "@/lib/utils";
import { personFullName } from "@/lib/person-name";

function sectionTitle(type: string) {
  if (type === "MCQ") return "Section A — Multiple choice";
  if (type === "TRUE_FALSE") return "Section B — True / False";
  if (type === "SHORT_ANSWER") return "Section C — Open-ended";
  if (type === "FILL_IN_THE_BLANK") return "Fill in the blanks";
  return quizQuestionTypeLabel(type);
}

function groupedQuestions(questions: QuizQuestion[]) {
  const order = ["MCQ", "TRUE_FALSE", "FILL_IN_THE_BLANK", "SHORT_ANSWER"];
  const included = questions.filter((question) => question.included !== false);
  return order
    .map((type) => ({
      type,
      items: included.filter((question) => question.type === type),
    }))
    .filter((group) => group.items.length);
}

function formatExamDate(quiz: Quiz) {
  const raw = quiz.examConfig?.startDate || quiz.dueAt || quiz.submittedAt || quiz.createdAt;
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function ExamPrintView({
  quiz,
  showAnswers = false,
}: {
  quiz: Quiz;
  showAnswers?: boolean;
}) {
  const groups = groupedQuestions(quiz.questions ?? []);
  const totalMarks = formatMarks(quiz.totalMarks ?? 0);
  const classLabel = [quiz.section?.grade?.name, quiz.section?.name].filter(Boolean).join(" ");
  const schoolName = quiz.school?.name?.trim() || "School";
  const examDate = formatExamDate(quiz);
  const paperLabel = examPaperLabel(quiz.paperKind);
  let number = 1;

  return (
    <div className="exam-print mx-auto max-w-3xl bg-white p-6 text-black print:max-w-none print:p-0">
      <div className="exam-print-header border-b-2 border-black pb-4 text-center">
        <h1 className="text-2xl font-bold uppercase tracking-wide">{schoolName}</h1>
        <p className="mt-3 text-sm">
          <span className="font-semibold">Date:</span> {examDate ?? "____________________"}
        </p>
        <p className="mt-2 text-xl font-semibold">{paperLabel}</p>
        <p className="mt-2 text-base font-medium">
          Class: {classLabel || "____________________"}
        </p>
        <p className="mt-1 text-sm">
          {quiz.subject?.name ? `Subject: ${quiz.subject.name}` : null}
          {quiz.subject?.name && totalMarks ? " · " : null}
          {totalMarks ? `${totalMarks} marks` : null}
        </p>
        {quiz.createdBy ? (
          <p className="mt-1 text-xs text-neutral-700">
            Prepared by {personFullName(quiz.createdBy.firstName, quiz.createdBy.lastName)}
          </p>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <p>
          <span className="font-semibold">Student name:</span> ______________________________
        </p>
        <p>
          <span className="font-semibold">Roll number:</span> ____________________
        </p>
      </div>

      {groups.map((group) => {
        const sectionMarks = formatMarks(
          group.items.reduce((sum, item) => sum + Number(item.marks ?? 0), 0),
        );
        return (
          <section key={group.type} className="mt-8">
            <h2 className="mb-3 border-b border-neutral-400 pb-1 text-base font-semibold">
              {sectionTitle(group.type)} ({sectionMarks} marks)
            </h2>
            <ol className="space-y-5">
              {group.items.map((question) => {
                const n = number++;
                const options = question.options ?? [];
                return (
                  <li key={question.id} className="text-sm">
                    <p className="font-medium">
                      {n}. {question.questionText}{" "}
                      <span className="font-normal text-neutral-600">[{formatMarks(question.marks)}]</span>
                    </p>
                    {options.length ? (
                      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                        {options.map((opt, i) => (
                          <li key={opt.id ?? `${question.id}-${i}`}>
                            {String.fromCharCode(65 + i)}. {quizOptionLabel(opt)}
                          </li>
                        ))}
                      </ul>
                    ) : question.type === "SHORT_ANSWER" ? (
                      <div className="mt-3 space-y-3">
                        <div className="h-8 border-b border-neutral-400" />
                        <div className="h-8 border-b border-neutral-400" />
                        <div className="h-8 border-b border-neutral-400" />
                      </div>
                    ) : (
                      <div className="mt-3 h-8 border-b border-neutral-400" />
                    )}
                    {showAnswers && question.correctAnswer ? (
                      <p className="mt-2 text-xs text-neutral-700 print:hidden">
                        Answer key: {question.correctAnswer}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
