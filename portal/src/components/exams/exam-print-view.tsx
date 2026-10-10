"use client";

import { SchoolLetterhead } from "@/components/brand/school-letterhead";
import { examPaperLabel } from "@/lib/exam-paper";
import type { Quiz, QuizQuestion } from "@/lib/types";
import { formatMarks, quizOptionLabel, quizQuestionTypeLabel } from "@/lib/utils";
import { personFullName } from "@/lib/person-name";

function sectionHeading(type: string, letter: string) {
  if (type === "MCQ") return `Section ${letter} — Multiple Choice Questions`;
  if (type === "TRUE_FALSE") return `Section ${letter} — True / False`;
  if (type === "FILL_IN_THE_BLANK") return `Section ${letter} — Fill in the Blanks`;
  if (type === "SHORT_ANSWER") return `Section ${letter} — Short Answer Questions`;
  if (type === "LONG_ANSWER") return `Section ${letter} — Long Answer Questions`;
  return `Section ${letter} — ${quizQuestionTypeLabel(type)}`;
}

function groupedQuestions(questions: QuizQuestion[]) {
  const order = ["MCQ", "TRUE_FALSE", "FILL_IN_THE_BLANK", "SHORT_ANSWER", "LONG_ANSWER"];
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
    <div className="exam-print mx-auto max-w-3xl bg-white text-black print:max-w-none">
      {/* Outer decorative frame — black only for B&W printers */}
      <div className="exam-print-frame border-4 border-double border-black p-1">
        <div className="border border-black px-5 py-6 sm:px-8 sm:py-8 print:px-6 print:py-6">
          <header className="exam-print-header text-center">
            <SchoolLetterhead
              name={schoolName}
              logo={quiz.school?.logo}
              titleClassName="text-2xl tracking-[0.12em]"
              logoClassName="h-14 w-14 rounded-none border-2 border-black"
            />
            <div
              className="mx-auto mt-3 max-w-md border-y border-black py-1 font-serif text-[10px] tracking-[0.35em] text-black"
              aria-hidden
            >
              ◆ ◆ ◆
            </div>
            <p className="mt-3 font-serif text-lg font-bold uppercase tracking-wide underline decoration-1 underline-offset-4">
              {paperLabel}
            </p>
            <p className="mt-3 font-serif text-sm">
              <span className="font-semibold">Class:</span> {classLabel || "____________________"}
              {quiz.subject?.name ? (
                <>
                  <span className="mx-2 text-neutral-500">|</span>
                  <span className="font-semibold">Subject:</span> {quiz.subject.name}
                </>
              ) : null}
              {totalMarks ? (
                <>
                  <span className="mx-2 text-neutral-500">|</span>
                  <span className="font-semibold">Total Marks:</span> {totalMarks}
                </>
              ) : null}
            </p>
            <p className="mt-1 font-serif text-sm">
              <span className="font-semibold">Date:</span> {examDate ?? "____________________"}
            </p>
            {quiz.createdBy ? (
              <p className="mt-1 font-serif text-xs italic text-neutral-800">
                Prepared by {personFullName(quiz.createdBy.firstName, quiz.createdBy.lastName)}
              </p>
            ) : null}
          </header>

          <div className="mt-5 grid grid-cols-1 gap-2 border border-black px-3 py-3 font-serif text-sm sm:grid-cols-2">
            <p>
              <span className="font-semibold">Student name:</span> ______________________________
            </p>
            <p>
              <span className="font-semibold">Roll number:</span> ____________________
            </p>
          </div>

          <p className="mt-3 border-l-2 border-black pl-3 font-serif text-xs italic leading-relaxed text-neutral-800">
            Instructions: Read each question carefully. Attempt all questions. Write clearly. Marks
            for each question are shown in brackets [ ].
          </p>

          <div className="my-5 border-t border-black" />

          {groups.map((group, groupIndex) => {
            const sectionLetter = String.fromCharCode(65 + groupIndex);
            const sectionMarks = formatMarks(
              group.items.reduce((sum, item) => sum + Number(item.marks ?? 0), 0),
            );
            return (
              <section key={group.type} className="mt-7 break-inside-avoid-page">
                <h2 className="mb-3 flex items-baseline justify-between gap-3 border-b-2 border-black pb-1 font-serif text-base font-bold uppercase tracking-wide">
                  <span>{sectionHeading(group.type, sectionLetter)}</span>
                  <span className="shrink-0 text-xs font-semibold normal-case tracking-normal">
                    ({sectionMarks} marks)
                  </span>
                </h2>
                <ol className="space-y-5">
                  {group.items.map((question) => {
                    const n = number++;
                    const options = question.options ?? [];
                    const answerLines =
                      question.type === "LONG_ANSWER"
                        ? 8
                        : question.type === "SHORT_ANSWER"
                          ? 3
                          : 1;
                    return (
                      <li key={question.id} className="font-serif text-sm leading-relaxed">
                        <p>
                          <span className="font-bold">{n}.</span> {question.questionText}{" "}
                          <span className="whitespace-nowrap font-semibold">
                            [{formatMarks(question.marks)}]
                          </span>
                        </p>
                        {options.length ? (
                          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                            {options.map((opt, i) => (
                              <li key={opt.id ?? `${question.id}-${i}`} className="pl-1">
                                <span className="inline-block min-w-[1.5rem] font-semibold">
                                  ({String.fromCharCode(65 + i)})
                                </span>{" "}
                                {quizOptionLabel(opt)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="mt-3 space-y-3">
                            {Array.from({ length: answerLines }, (_, line) => (
                              <div key={line} className="h-7 border-b border-neutral-500" />
                            ))}
                          </div>
                        )}
                        {showAnswers && question.correctAnswer ? (
                          <p
                            className={`mt-2 text-xs text-neutral-700 print:hidden ${
                              question.type === "LONG_ANSWER"
                                ? "max-h-40 overflow-y-auto whitespace-pre-wrap"
                                : ""
                            }`}
                          >
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

          <footer className="mt-10 text-center font-serif text-xs italic text-neutral-800">
            <div className="mx-auto mb-2 max-w-xs border-t border-black pt-3">— End of Question Paper —</div>
          </footer>
        </div>
      </div>
    </div>
  );
}
