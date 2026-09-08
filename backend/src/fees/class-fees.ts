import { FeeFrequency, FeeKind, Prisma } from '@prisma/client';

type FeeDb = {
  feeStructure: {
    findFirst: Prisma.FeeStructureDelegate['findFirst'];
    update: Prisma.FeeStructureDelegate['update'];
    upsert: Prisma.FeeStructureDelegate['upsert'];
  };
};

export function positiveAmount(value?: number | null): number | null {
  if (value == null || Number.isNaN(Number(value))) return null;
  const amount = Number(value);
  return amount > 0 ? amount : null;
}

export function classFeeName(gradeName: string, kind: 'ADMISSION' | 'TUITION'): string {
  return kind === 'ADMISSION' ? `${gradeName} admission` : `${gradeName} monthly tuition`;
}

async function syncNamedFee(
  db: FeeDb,
  input: {
    schoolId: string;
    gradeId: string;
    gradeName: string;
    kind: 'ADMISSION' | 'TUITION';
    amount: number | null;
    frequency: FeeFrequency;
    description: string;
  },
) {
  const name = classFeeName(input.gradeName, input.kind);
  const existing = await db.feeStructure.findFirst({
    where: { schoolId: input.schoolId, gradeId: input.gradeId, kind: input.kind },
  });

  if (!input.amount) {
    if (existing) {
      await db.feeStructure.update({
        where: { id: existing.id },
        data: { active: false, name },
      });
    }
    return;
  }

  const data = {
    name,
    amount: input.amount,
    frequency: input.frequency,
    description: input.description,
    gradeId: input.gradeId,
    kind: input.kind as FeeKind,
    active: true,
  };

  if (existing) {
    await db.feeStructure.update({ where: { id: existing.id }, data });
    return;
  }

  await db.feeStructure.upsert({
    where: { schoolId_name: { schoolId: input.schoolId, name } },
    create: { schoolId: input.schoolId, ...data },
    update: data,
  });
}

export async function syncClassFeeStructures(
  db: FeeDb,
  input: {
    schoolId: string;
    gradeId: string;
    gradeName: string;
    admissionFee?: number | null;
    tuitionFee?: number | null;
  },
) {
  await syncNamedFee(db, {
    schoolId: input.schoolId,
    gradeId: input.gradeId,
    gradeName: input.gradeName,
    kind: 'ADMISSION',
    amount: positiveAmount(input.admissionFee),
    frequency: 'ONE_TIME',
    description: `Admission fee for ${input.gradeName}`,
  });
  await syncNamedFee(db, {
    schoolId: input.schoolId,
    gradeId: input.gradeId,
    gradeName: input.gradeName,
    kind: 'TUITION',
    amount: positiveAmount(input.tuitionFee),
    frequency: 'MONTHLY',
    description: `Monthly tuition for ${input.gradeName}`,
  });
}
