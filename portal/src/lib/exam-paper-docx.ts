import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
  UnderlineType,
  convertInchesToTwip,
} from "docx";
import { examPaperLabel } from "@/lib/exam-paper";
import type { Quiz, QuizQuestion } from "@/lib/types";
import { formatMarks, quizOptionLabel, quizQuestionTypeLabel } from "@/lib/utils";
import { personFullName } from "@/lib/person-name";

const BLACK = "000000";

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

function ruleLine() {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 80 },
    children: [
      new TextRun({
        text: "════════════════════════════════════════════════════════════",
        size: 16,
        font: "Courier New",
        color: BLACK,
      }),
    ],
  });
}

function thinRule() {
  return new Paragraph({
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 12, color: BLACK, space: 4 },
    },
    spacing: { after: 160 },
    children: [],
  });
}

function blankAnswerLines(count: number) {
  return Array.from({ length: count }, () =>
    new Paragraph({
      spacing: { before: 60, after: 60 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: "666666", space: 1 },
      },
      children: [new TextRun({ text: " ", size: 20 })],
    }),
  );
}

function buildBody(quiz: Quiz): Paragraph[] {
  const groups = groupedQuestions(quiz.questions ?? []);
  const totalMarks = formatMarks(quiz.totalMarks ?? 0);
  const classLabel = [quiz.section?.grade?.name, quiz.section?.name].filter(Boolean).join(" ");
  const schoolName = quiz.school?.name?.trim() || "School";
  const examDate = formatExamDate(quiz);
  const paperLabel = examPaperLabel(quiz.paperKind);
  const preparedBy = quiz.createdBy
    ? personFullName(quiz.createdBy.firstName, quiz.createdBy.lastName)
    : null;

  const paras: Paragraph[] = [
    ruleLine(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: schoolName.toUpperCase(),
          bold: true,
          size: 32,
          font: "Times New Roman",
          color: BLACK,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: paperLabel,
          bold: true,
          size: 26,
          font: "Times New Roman",
          color: BLACK,
          underline: { type: UnderlineType.SINGLE, color: BLACK },
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: [
            classLabel ? `Class: ${classLabel}` : "Class: ____________",
            quiz.subject?.name ? `Subject: ${quiz.subject.name}` : null,
            totalMarks ? `Total Marks: ${totalMarks}` : null,
          ]
            .filter(Boolean)
            .join("   |   "),
          size: 22,
          font: "Times New Roman",
          color: BLACK,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: `Date: ${examDate ?? "____________________"}`,
          size: 20,
          font: "Times New Roman",
          color: BLACK,
        }),
      ],
    }),
  ];

  if (preparedBy) {
    paras.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: `Prepared by: ${preparedBy}`,
            size: 18,
            italics: true,
            font: "Times New Roman",
            color: BLACK,
          }),
        ],
      }),
    );
  }

  paras.push(ruleLine());

  paras.push(
    new Paragraph({
      spacing: { before: 120, after: 80 },
      children: [
        new TextRun({
          text: "Student name: ______________________________     Roll no: ____________________",
          size: 20,
          font: "Times New Roman",
          color: BLACK,
        }),
      ],
    }),
  );

  paras.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "Instructions: Read each question carefully. Attempt all questions. Write clearly. Marks for each question are shown in brackets.",
          size: 18,
          italics: true,
          font: "Times New Roman",
          color: BLACK,
        }),
      ],
    }),
  );

  paras.push(thinRule());

  let number = 1;
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex]!;
    const sectionLetter = String.fromCharCode(65 + groupIndex);
    const sectionMarks = formatMarks(
      group.items.reduce((sum, item) => sum + Number(item.marks ?? 0), 0),
    );

    paras.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 120 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 12, color: BLACK, space: 6 },
        },
        children: [
          new TextRun({
            text: `${sectionHeading(group.type, sectionLetter)}  (${sectionMarks} marks)`,
            bold: true,
            size: 24,
            font: "Times New Roman",
            color: BLACK,
          }),
        ],
      }),
    );

    for (const question of group.items) {
      const n = number++;
      const options = question.options ?? [];
      const marks = formatMarks(question.marks);

      paras.push(
        new Paragraph({
          spacing: { before: 160, after: 60 },
          children: [
            new TextRun({
              text: `${n}.  `,
              bold: true,
              size: 22,
              font: "Times New Roman",
              color: BLACK,
            }),
            new TextRun({
              text: question.questionText,
              size: 22,
              font: "Times New Roman",
              color: BLACK,
            }),
            new TextRun({
              text: `  [${marks}]`,
              bold: true,
              size: 20,
              font: "Times New Roman",
              color: BLACK,
            }),
          ],
        }),
      );

      if (options.length) {
        options.forEach((opt, i) => {
          paras.push(
            new Paragraph({
              indent: { left: convertInchesToTwip(0.35) },
              spacing: { after: 40 },
              children: [
                new TextRun({
                  text: `(${String.fromCharCode(65 + i)})  ${quizOptionLabel(opt)}`,
                  size: 20,
                  font: "Times New Roman",
                  color: BLACK,
                }),
              ],
            }),
          );
        });
      } else {
        const answerLines =
          question.type === "LONG_ANSWER" ? 7 : question.type === "SHORT_ANSWER" ? 3 : 1;
        paras.push(...blankAnswerLines(answerLines));
      }
    }
  }

  paras.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 360 },
      children: [
        new TextRun({
          text: "— End of Question Paper —",
          italics: true,
          size: 18,
          font: "Times New Roman",
          color: BLACK,
        }),
      ],
    }),
  );
  paras.push(ruleLine());

  return paras;
}

export async function buildExamPaperDocxBlob(quiz: Quiz): Promise<Blob> {
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.7),
              bottom: convertInchesToTwip(0.7),
              left: convertInchesToTwip(0.75),
              right: convertInchesToTwip(0.75),
            },
            borders: {
              pageBorderTop: {
                style: BorderStyle.DOUBLE,
                size: 24,
                color: BLACK,
                space: 18,
              },
              pageBorderRight: {
                style: BorderStyle.DOUBLE,
                size: 24,
                color: BLACK,
                space: 18,
              },
              pageBorderBottom: {
                style: BorderStyle.DOUBLE,
                size: 24,
                color: BLACK,
                space: 18,
              },
              pageBorderLeft: {
                style: BorderStyle.DOUBLE,
                size: 24,
                color: BLACK,
                space: 18,
              },
            },
          },
        },
        children: buildBody(quiz),
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "Page ",
                    size: 16,
                    font: "Times New Roman",
                    color: BLACK,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 16,
                    font: "Times New Roman",
                    color: BLACK,
                  }),
                  new TextRun({
                    text: " of ",
                    size: 16,
                    font: "Times New Roman",
                    color: BLACK,
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 16,
                    font: "Times New Roman",
                    color: BLACK,
                  }),
                ],
              }),
            ],
          }),
        },
      },
    ],
  });

  return Packer.toBlob(doc);
}

export function examPaperDocxFilename(quiz: Quiz): string {
  const paper = examPaperLabel(quiz.paperKind).replace(/\s+/g, "-");
  const subject = (quiz.subject?.name ?? "Subject").replace(/[^\w\-]+/g, "");
  const klass = [quiz.section?.grade?.name, quiz.section?.name]
    .filter(Boolean)
    .join("-")
    .replace(/[^\w\-]+/g, "");
  return `${paper}_${klass}_${subject || "Exam"}.docx`;
}

export async function downloadExamPaperDocx(quiz: Quiz): Promise<void> {
  const blob = await buildExamPaperDocxBlob(quiz);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = examPaperDocxFilename(quiz);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
