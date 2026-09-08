import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type TemplateLine = {
  sortOrder: number;
  label: string;
  maxMarks: number | null;
  matchSubject: string;
  choiceGroup?: string;
  includeInTotal?: boolean;
};

type TemplateDef = {
  code: string;
  examTitle: string;
  classLabel: string;
  totalMarks: number;
  showRank: boolean;
  showStream: boolean;
  showFatherName: boolean;
  showDate: boolean;
  showGradingKey: boolean;
  showMonthYear: boolean;
  lines: TemplateLine[];
};

const GRADING = [
  { min: 80, max: 100, letter: 'A+' },
  { min: 70, max: 79, letter: 'A' },
  { min: 60, max: 69, letter: 'B' },
  { min: 50, max: 59, letter: 'C' },
  { min: 40, max: 49, letter: 'D' },
  { min: 0, max: 39, letter: 'Unqualified' },
];

const ADDRESS = "Plot no 312, Pedro D'Souza Road, Garden East, Karachi";
const PHONE = '0315-8260008, 0334-3114395';

const TEMPLATES: TemplateDef[] = [
  {
    code: 'CLASS_10',
    examTitle: 'PRELIMINARY EXAMS',
    classLabel: 'CLASS X',
    totalMarks: 550,
    showRank: true,
    showStream: true,
    showFatherName: false,
    showDate: false,
    showGradingKey: false,
    showMonthYear: true,
    lines: [
      { sortOrder: 1, label: 'Mathematics II', maxMarks: 75, matchSubject: 'mathematics' },
      { sortOrder: 2, label: 'English  II', maxMarks: 100, matchSubject: 'english' },
      { sortOrder: 3, label: 'Physics II', maxMarks: 75, matchSubject: 'physics' },
      { sortOrder: 4, label: 'Chemistry II', maxMarks: 75, matchSubject: 'chemistry' },
      { sortOrder: 5, label: 'Sindhi', maxMarks: 75, matchSubject: 'sindhi' },
      { sortOrder: 6, label: 'Pakistan Studies', maxMarks: 75, matchSubject: 'pakistan studies' },
      {
        sortOrder: 7,
        label: 'Comp II / Bio II',
        maxMarks: 75,
        matchSubject: 'computer',
        choiceGroup: 'SCIENCE_GROUP',
      },
    ],
  },
  {
    code: 'CLASS_9',
    examTitle: 'PRELIMINARY EXAMS',
    classLabel: 'CLASS IX',
    totalMarks: 550,
    showRank: false,
    showStream: true,
    showFatherName: false,
    showDate: false,
    showGradingKey: false,
    showMonthYear: true,
    lines: [
      { sortOrder: 1, label: 'Mathematics I', maxMarks: 75, matchSubject: 'mathematics' },
      { sortOrder: 2, label: 'English  I', maxMarks: 100, matchSubject: 'english' },
      { sortOrder: 3, label: 'Physics I', maxMarks: 75, matchSubject: 'physics' },
      { sortOrder: 4, label: 'Chemistry I', maxMarks: 75, matchSubject: 'chemistry' },
      { sortOrder: 5, label: 'Islamiat', maxMarks: 75, matchSubject: 'islamiat' },
      { sortOrder: 6, label: 'Urdu', maxMarks: 75, matchSubject: 'urdu' },
      {
        sortOrder: 7,
        label: 'Comp I / Bio I',
        maxMarks: 75,
        matchSubject: 'computer',
        choiceGroup: 'SCIENCE_GROUP',
      },
    ],
  },
  {
    code: 'CLASS_1_3',
    examTitle: 'FINAL TERM EXAMINATION',
    classLabel: '1 to 3',
    totalMarks: 625,
    showRank: true,
    showStream: false,
    showFatherName: true,
    showDate: true,
    showGradingKey: true,
    showMonthYear: false,
    lines: [
      { sortOrder: 1, label: 'Islamiat', maxMarks: 100, matchSubject: 'islamiat' },
      { sortOrder: 2, label: 'English Lit', maxMarks: 100, matchSubject: 'english' },
      { sortOrder: 3, label: 'English Lang', maxMarks: 75, matchSubject: 'english' },
      { sortOrder: 4, label: 'Urdu', maxMarks: 100, matchSubject: 'urdu' },
      { sortOrder: 5, label: 'Mathematics', maxMarks: 100, matchSubject: 'mathematics' },
      { sortOrder: 6, label: 'Science', maxMarks: 75, matchSubject: 'science' },
      { sortOrder: 7, label: 'Social St.', maxMarks: 75, matchSubject: 'social studies' },
      { sortOrder: 8, label: 'Arts', maxMarks: null, matchSubject: 'arts', includeInTotal: false },
    ],
  },
  {
    code: 'CLASS_4_8',
    examTitle: 'FINAL TERM EXAMINATION',
    classLabel: '4 to 8',
    totalMarks: 800,
    showRank: true,
    showStream: false,
    showFatherName: true,
    showDate: true,
    showGradingKey: true,
    showMonthYear: false,
    lines: [
      { sortOrder: 1, label: 'Islamiat', maxMarks: 100, matchSubject: 'islamiat' },
      { sortOrder: 2, label: 'English Lit', maxMarks: 100, matchSubject: 'english' },
      { sortOrder: 3, label: 'English Lang', maxMarks: 75, matchSubject: 'english' },
      { sortOrder: 4, label: 'Urdu', maxMarks: 100, matchSubject: 'urdu' },
      { sortOrder: 5, label: 'Mathematics', maxMarks: 100, matchSubject: 'mathematics' },
      { sortOrder: 6, label: 'Science', maxMarks: 75, matchSubject: 'science' },
      { sortOrder: 7, label: 'Social St.', maxMarks: 75, matchSubject: 'social studies' },
      { sortOrder: 8, label: 'Computer', maxMarks: 75, matchSubject: 'computer' },
      { sortOrder: 9, label: 'Sindhi', maxMarks: 100, matchSubject: 'sindhi' },
      { sortOrder: 10, label: 'Arts', maxMarks: null, matchSubject: 'arts', includeInTotal: false },
    ],
  },
];

async function main() {
  const school = await prisma.school.findUnique({ where: { code: 'TPS' } });
  if (!school) {
    throw new Error('School TPS was not found');
  }

  await prisma.school.update({
    where: { id: school.id },
    data: {
      address: ADDRESS,
      phone: PHONE,
      city: 'Karachi',
      country: 'Pakistan',
    },
  });

  const existingSettings = await prisma.schoolSettings.findUnique({ where: { schoolId: school.id } });
  const previous =
    existingSettings?.metadata && typeof existingSettings.metadata === 'object' && !Array.isArray(existingSettings.metadata)
      ? (existingSettings.metadata as Record<string, unknown>)
      : {};

  await prisma.schoolSettings.upsert({
    where: { schoolId: school.id },
    create: {
      schoolId: school.id,
      setupCompleted: true,
      examPattern: 'TPS',
      metadata: {
        reportCard: {
          grading: GRADING,
          footer: { address: ADDRESS, contact: PHONE },
          class9Totals:
            'Class 9 paper left subject totals blank; English 100 and other papers 75 (total 550), matching Class 10.',
        },
      },
    },
    update: {
      examPattern: 'TPS',
      metadata: {
        ...previous,
        reportCard: {
          grading: GRADING,
          footer: { address: ADDRESS, contact: PHONE },
          class9Totals:
            'Class 9 paper left subject totals blank; English 100 and other papers 75 (total 550), matching Class 10.',
        },
      },
    },
  });

  for (const template of TEMPLATES) {
    const saved = await prisma.reportCardTemplate.upsert({
      where: { schoolId_code: { schoolId: school.id, code: template.code } },
      create: {
        schoolId: school.id,
        code: template.code,
        examTitle: template.examTitle,
        classLabel: template.classLabel,
        totalMarks: template.totalMarks,
        showRank: template.showRank,
        showStream: template.showStream,
        showFatherName: template.showFatherName,
        showDate: template.showDate,
        showGradingKey: template.showGradingKey,
        showMonthYear: template.showMonthYear,
      },
      update: {
        examTitle: template.examTitle,
        classLabel: template.classLabel,
        totalMarks: template.totalMarks,
        showRank: template.showRank,
        showStream: template.showStream,
        showFatherName: template.showFatherName,
        showDate: template.showDate,
        showGradingKey: template.showGradingKey,
        showMonthYear: template.showMonthYear,
      },
    });
    await prisma.reportCardTemplateLine.deleteMany({ where: { templateId: saved.id } });
    await prisma.reportCardTemplateLine.createMany({
      data: template.lines.map((line) => ({
        templateId: saved.id,
        sortOrder: line.sortOrder,
        label: line.label,
        maxMarks: line.maxMarks,
        matchSubject: line.matchSubject,
        choiceGroup: line.choiceGroup ?? null,
        includeInTotal: line.includeInTotal ?? true,
      })),
    });
  }

  const years = await prisma.academicYear.findMany({
    where: { schoolId: school.id },
    orderBy: { startDate: 'desc' },
  });
  const examPapers = [
    { name: 'Preliminary Exams', maxMarks: 550, sequence: 1 },
    { name: 'Final Term Examination', maxMarks: 800, sequence: 2 },
  ];
  for (const year of years) {
    for (const paper of examPapers) {
      await prisma.examConfig.upsert({
        where: { academicYearId_name: { academicYearId: year.id, name: paper.name } },
        create: {
          schoolId: school.id,
          academicYearId: year.id,
          name: paper.name,
          maxMarks: paper.maxMarks,
          sequence: paper.sequence,
        },
        update: { maxMarks: paper.maxMarks, sequence: paper.sequence },
      });
    }
  }

  const stored = await prisma.reportCardTemplate.findMany({
    where: { schoolId: school.id },
    include: { _count: { select: { lines: true } } },
    orderBy: { code: 'asc' },
  });
  console.log(
    JSON.stringify(
      {
        school: school.name,
        address: ADDRESS,
        phone: PHONE,
        templates: stored.map((row) => ({ code: row.code, examTitle: row.examTitle, lines: row._count.lines })),
        years: years.map((year) => year.name),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
