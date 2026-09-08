import { PrismaClient } from '@prisma/client';
import { syncClassFeeStructures } from '../src/fees/class-fees';

const prisma = new PrismaClient();

function tuitionForClass(name: string): number | null {
  const n = name.trim().toLowerCase();
  if (/^level\s*[12]$/.test(n)) return null;
  const match = n.match(/class\s*(\d+)/) ?? n.match(/\b(\d+)\b/);
  const level = match ? Number(match[1]) : NaN;
  if (level >= 1 && level <= 8) return 5500;
  if (level === 9 || level === 10) return 6000;
  return null;
}

async function main() {
  const school = await prisma.school.findUnique({ where: { code: 'TPS' } });
  if (!school) throw new Error('School TPS was not found');

  const grades = await prisma.grade.findMany({
    where: { schoolId: school.id },
    orderBy: { name: 'asc' },
  });

  const updated = [];
  for (const grade of grades) {
    const amount = tuitionForClass(grade.name);
    if (amount == null) {
      updated.push({ class: grade.name, tuition: Number(grade.tuitionFee ?? 0) || null, skipped: true });
      continue;
    }

    await prisma.grade.update({
      where: { id: grade.id },
      data: { tuitionFee: amount },
    });

    await syncClassFeeStructures(prisma, {
      schoolId: school.id,
      gradeId: grade.id,
      gradeName: grade.name,
      admissionFee: grade.admissionFee != null ? Number(grade.admissionFee) : null,
      tuitionFee: amount,
    });

    updated.push({ class: grade.name, tuition: amount });
  }

  console.log(JSON.stringify({ school: school.name, updated }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
