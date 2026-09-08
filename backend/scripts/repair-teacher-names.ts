/**
 * Repair teacher last names that were wrongly copied from first names,
 * and set gender so UI can show Miss / Mr.
 *
 * Run: npx ts-node --transpile-only scripts/repair-teacher-names.ts
 */
import { Gender, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MALE_FIRST_NAMES = new Set(
  ['anas', 'daniyal', 'faraz', 'shehryar', 'ahmed', 'ali', 'hassan', 'usman', 'bilal'].map((n) =>
    n.toLowerCase(),
  ),
);

async function main() {
  const teachers = await prisma.teacherProfile.findMany({
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
  });

  let clearedLast = 0;
  let setGender = 0;

  for (const teacher of teachers) {
    const first = teacher.user.firstName.trim();
    const last = (teacher.user.lastName ?? '').trim();
    const updates: { lastName?: string } = {};
    if (last && first && last.toLowerCase() === first.toLowerCase()) {
      updates.lastName = '';
      clearedLast += 1;
    } else if (last === '-') {
      updates.lastName = '';
      clearedLast += 1;
    }
    if (Object.keys(updates).length) {
      await prisma.user.update({ where: { id: teacher.user.id }, data: updates });
    }

    if (!teacher.gender) {
      const gender = MALE_FIRST_NAMES.has(first.toLowerCase()) ? Gender.MALE : Gender.FEMALE;
      await prisma.teacherProfile.update({
        where: { id: teacher.id },
        data: { gender },
      });
      setGender += 1;
    }
  }

  console.log(JSON.stringify({ teachers: teachers.length, clearedLast, setGender }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
