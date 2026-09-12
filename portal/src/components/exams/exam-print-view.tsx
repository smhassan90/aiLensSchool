"use client";

import { examPaperLabel } from "@/lib/exam-paper";
import type { Quiz, QuizQuestion } from "@/lib/types";
import { quizOptionLabel, quizQuestionTypeLabel } from "@/lib/utils";
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

export function ExamPrintView({
  quiz,
  showAnswers = false,
}: {
  quiz: Quiz;
  showAnswers?: boolean;
}) {
  const groups = groupedQuestions(quiz.questions ?? []);
  const totalMarks = Number(quiz.totalMarks ?? 0);
  const classLabel = [quiz.section?.grade?.name, quiz.section?.name].filter(Boolean).join(" ");
  let number = 1;

  return (
    <div className="exam-print mx-auto max-w-3xl bg-white text-black">
      <header className="border-b-2 border-black pb-3 text-center">
        <p className="text-sm uppercase tracking-wide">{examPaperLabel(quiz.paperKind)}</p>
        <h1 className="mt-1 text-2xl font-semibold">{quiz.title}</h1>
        <p className="mt-2 text-sm">
          {quiz.subject?.name ?? "Subject"}
          {classLabel ? ` · ${classLabel}` : ""}
          {totalMarks ? ` · ${totalMarks} marks` : ""}
        </p>
        {quiz.createdBy ? (
          <p className="mt-1 text-xs">
            Prepared by {personFullName(quiz.createdBy.firstName, quiz.createdBy.lastName)}
          </p>
        ) : null}
      </header>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <p>Name: ______________________________</p>
        <p>Roll no: ____________________</p>
        <p>Date: _______________________________</p>
        <p>Time: ______________________</p>
      </div>

      {groups.map((group) => {
        const sectionMarks = group.items.reduce((sum, item) => sum + Number(item.marks ?? 0), 0);
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
                      <span className="font-normal text-neutral-600">[{Number(question.marks)}]</span>
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
                      <p className="mt-2 text-xs text-neutral-700">
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
