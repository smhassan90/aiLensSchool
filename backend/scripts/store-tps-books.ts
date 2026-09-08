import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type BookRow = {
  className: string;
  subject: string;
  book: string;
  publisher: string;
};

const BOOKS: BookRow[] = [
  { className: 'Class 1', subject: 'Urdu', book: 'Urdu (Motia)', publisher: 'Oxford Publishers' },
  { className: 'Class 1', subject: 'English', book: 'Oxford Reading Circle – 1', publisher: 'Oxford Publishers' },
  { className: 'Class 1', subject: 'English', book: 'Grammar Tree – 1', publisher: 'Oxford Publishers' },
  { className: 'Class 1', subject: 'Maths', book: 'Countdown – 1', publisher: 'Oxford Publishers' },
  { className: 'Class 1', subject: 'Islamiat', book: 'Islamiat – 1', publisher: 'Bookmark' },
  { className: 'Class 1', subject: 'Social Studies', book: 'Social Studies – 1', publisher: 'Paramount' },
  { className: 'Class 1', subject: 'Science', book: 'Science Awareness – 1', publisher: 'Paramount' },

  { className: 'Class 2', subject: 'Urdu', book: 'Urdu (Gainda)', publisher: 'Oxford Publishers' },
  { className: 'Class 2', subject: 'English', book: 'Oxford Reading Circle – 2', publisher: 'Oxford Publishers' },
  { className: 'Class 2', subject: 'English', book: 'Grammar Tree – 2', publisher: 'Oxford Publishers' },
  { className: 'Class 2', subject: 'Maths', book: 'Countdown – 2', publisher: 'Oxford Publishers' },
  { className: 'Class 2', subject: 'Islamiat', book: 'Islamiat – 2', publisher: 'Bookmark' },
  { className: 'Class 2', subject: 'Social Studies', book: 'Social Studies – 2', publisher: 'Paramount' },
  { className: 'Class 2', subject: 'Science', book: 'Science Awareness – 2', publisher: 'Paramount' },

  { className: 'Class 3', subject: 'Urdu', book: 'Urdu (Sada Bahar)', publisher: 'Oxford Publishers' },
  { className: 'Class 3', subject: 'English', book: 'Oxford Reading Circle – 3', publisher: 'Oxford Publishers' },
  { className: 'Class 3', subject: 'English', book: 'Grammar Tree – 3', publisher: 'Oxford Publishers' },
  { className: 'Class 3', subject: 'Maths', book: 'Countdown – 3', publisher: 'Oxford Publishers' },
  { className: 'Class 3', subject: 'Islamiat', book: 'Islamiat – 3', publisher: 'Bookmark' },
  { className: 'Class 3', subject: 'Social Studies', book: 'Social Studies – 3', publisher: 'Paramount' },
  { className: 'Class 3', subject: 'Science', book: 'Science Awareness – 3', publisher: 'Paramount' },

  { className: 'Class 4', subject: 'Urdu', book: 'Urdu (Nargis)', publisher: 'Oxford Publishers' },
  { className: 'Class 4', subject: 'English', book: 'Oxford Reading Circle – 4', publisher: 'Oxford Publishers' },
  { className: 'Class 4', subject: 'English', book: 'Grammar Tree – 4', publisher: 'Oxford Publishers' },
  { className: 'Class 4', subject: 'Maths', book: 'Countdown – 4', publisher: 'Oxford Publishers' },
  { className: 'Class 4', subject: 'Computer', book: 'Computer Series - 4', publisher: 'Spectrum' },
  { className: 'Class 4', subject: 'Islamiat', book: 'Islamiat – 4', publisher: 'Bookmark' },
  { className: 'Class 4', subject: 'Social Studies', book: 'Social Studies – 4', publisher: 'Paramount' },
  { className: 'Class 4', subject: 'Science', book: 'Science Awareness – 4', publisher: 'Paramount' },
  { className: 'Class 4', subject: 'Sindhi', book: 'Sindhi – 4', publisher: 'S.T.B.B.' },

  { className: 'Class 5', subject: 'Urdu', book: 'Urdu (Gul e Lala)', publisher: 'Oxford Publishers' },
  { className: 'Class 5', subject: 'English', book: 'Oxford Reading Circle – 5', publisher: 'Oxford Publishers' },
  { className: 'Class 5', subject: 'English', book: 'Grammar Tree – 5', publisher: 'Oxford Publishers' },
  { className: 'Class 5', subject: 'Maths', book: 'Countdown – 5', publisher: 'Oxford Publishers' },
  { className: 'Class 5', subject: 'Computer', book: 'Computer Series - 5', publisher: 'Spectrum' },
  { className: 'Class 5', subject: 'Islamiat', book: 'Islamiat – 5', publisher: 'Bookmark' },
  { className: 'Class 5', subject: 'Social Studies', book: 'Social Studies – 5', publisher: 'Paramount' },
  { className: 'Class 5', subject: 'Science', book: 'Science Awareness – 5', publisher: 'Paramount' },
  { className: 'Class 5', subject: 'Sindhi', book: 'Sindhi – 5', publisher: 'S.T.B.B.' },

  { className: 'Class 6', subject: 'Urdu', book: 'Urdu (Champa)', publisher: 'Oxford Publishers' },
  { className: 'Class 6', subject: 'English', book: 'Oxford Reading Circle – 6', publisher: 'Oxford Publishers' },
  { className: 'Class 6', subject: 'English', book: 'Grammar Tree – 6', publisher: 'Oxford Publishers' },
  { className: 'Class 6', subject: 'Maths', book: 'Countdown – 6', publisher: 'Oxford Publishers' },
  { className: 'Class 6', subject: 'Science', book: 'Science Terry Jennings – 6', publisher: 'Oxford Publishers' },
  { className: 'Class 6', subject: 'Social Studies', book: 'Social Studies Peter Moss – 1', publisher: 'Oxford Publishers' },
  { className: 'Class 6', subject: 'Computer', book: 'Computer Series - 6', publisher: 'Spectrum' },
  { className: 'Class 6', subject: 'Sindhi', book: 'Sindhi – 6', publisher: 'S.T.B.B.' },
  { className: 'Class 6', subject: 'Islamiat', book: 'Islamiat – 6', publisher: 'Bookmark' },

  { className: 'Class 7', subject: 'Urdu', book: 'Urdu (Suraj Mukhi)', publisher: 'Oxford Publishers' },
  { className: 'Class 7', subject: 'English', book: 'Oxford Reading Circle – 7', publisher: 'Oxford Publishers' },
  { className: 'Class 7', subject: 'English', book: 'Grammar Tree – 7', publisher: 'Oxford Publishers' },
  { className: 'Class 7', subject: 'Maths', book: 'Countdown – 7', publisher: 'Oxford Publishers' },
  { className: 'Class 7', subject: 'Science', book: 'Science Terry Jennings – 7', publisher: 'Oxford Publishers' },
  { className: 'Class 7', subject: 'Social Studies', book: 'Social Studies Peter Moss – 2', publisher: 'Oxford Publishers' },
  { className: 'Class 7', subject: 'Computer', book: 'Computer Series - 7', publisher: 'Spectrum' },
  { className: 'Class 7', subject: 'Sindhi', book: 'Sindhi – 7', publisher: 'S.T.B.B.' },
  { className: 'Class 7', subject: 'Islamiat', book: 'Islamiat – 7', publisher: 'Bookmark' },

  { className: 'Class 8', subject: 'Urdu', book: 'Urdu (Kanwal)', publisher: 'Oxford Publishers' },
  { className: 'Class 8', subject: 'English', book: 'Oxford Reading Circle – 8', publisher: 'Oxford Publishers' },
  { className: 'Class 8', subject: 'English', book: 'Grammar Tree – 8', publisher: 'Oxford Publishers' },
  { className: 'Class 8', subject: 'Maths', book: 'Countdown – 8', publisher: 'Oxford Publishers' },
  { className: 'Class 8', subject: 'Science', book: 'Science Terry Jennings – 8', publisher: 'Oxford Publishers' },
  { className: 'Class 8', subject: 'Social Studies', book: 'Social Studies Peter Moss – 3', publisher: 'Oxford Publishers' },
  { className: 'Class 8', subject: 'Computer', book: 'Computer Series - 4', publisher: 'Spectrum' },
  { className: 'Class 8', subject: 'Sindhi', book: 'Sindhi – 8', publisher: 'S.T.B.B.' },
  { className: 'Class 8', subject: 'Islamiat', book: 'Islamiat – 8', publisher: 'Bookmark' },

  { className: 'Class 9', subject: 'English', book: 'English 1', publisher: '' },
  { className: 'Class 9', subject: 'Physics', book: 'Physics 1', publisher: '' },
  { className: 'Class 9', subject: 'Chemistry', book: 'Chemistry 1', publisher: '' },
  { className: 'Class 9', subject: 'Computer', book: 'Computer', publisher: '' },
  { className: 'Class 9', subject: 'Biology', book: 'Biology', publisher: '' },
  { className: 'Class 9', subject: 'Maths', book: 'Math 1', publisher: '' },
  { className: 'Class 9', subject: 'Urdu', book: 'Urdu', publisher: '' },
  { className: 'Class 9', subject: 'Islamiat', book: 'Islamiat', publisher: '' },

  { className: 'Class 10', subject: 'English', book: 'English 2', publisher: '' },
  { className: 'Class 10', subject: 'Physics', book: 'Physics 2', publisher: '' },
  { className: 'Class 10', subject: 'Chemistry', book: 'Chemistry 2', publisher: '' },
  { className: 'Class 10', subject: 'Computer', book: 'Computer 2', publisher: '' },
  { className: 'Class 10', subject: 'Biology', book: 'Biology 2', publisher: '' },
  { className: 'Class 10', subject: 'Maths', book: 'Math 2', publisher: '' },
  { className: 'Class 10', subject: 'Pakistan Studies', book: 'PST', publisher: '' },
  { className: 'Class 10', subject: 'Sindhi', book: 'Sindhi', publisher: '' },
];

async function main() {
  const school = await prisma.school.findUnique({ where: { code: 'TPS' } });
  if (!school) throw new Error('The Piercing Stars not found');

  let updated = 0;
  let created = 0;

  for (const row of BOOKS) {
    const grade = await prisma.grade.findFirst({
      where: { schoolId: school.id, name: row.className },
    });
    if (!grade) throw new Error(`Missing ${row.className}`);
    const subject = await prisma.subject.findFirst({
      where: { schoolId: school.id, gradeId: grade.id, name: row.subject },
    });
    if (!subject) throw new Error(`Missing ${row.subject} in ${row.className}`);

    const publisher = row.publisher || null;
    const combined = publisher ? `${row.book} — ${publisher}` : row.book;
    const existing = await prisma.curriculum.findFirst({
      where: {
        schoolId: school.id,
        subjectId: subject.id,
        gradeId: grade.id,
        OR: [{ name: row.book }, { name: combined }],
      },
    });

    if (existing) {
      await prisma.curriculum.update({
        where: { id: existing.id },
        data: { name: row.book, publisher },
      });
      updated += 1;
    } else {
      await prisma.curriculum.create({
        data: {
          schoolId: school.id,
          subjectId: subject.id,
          gradeId: grade.id,
          name: row.book,
          publisher,
        },
      });
      created += 1;
    }
  }

  const total = await prisma.curriculum.count({ where: { schoolId: school.id } });
  console.log(JSON.stringify({ updated, created, total }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
