import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const school = await prisma.school.findUnique({ where: { code: 'TPS' } });
  if (!school) throw new Error('School TPS was not found');

  const year = await prisma.academicYear.findFirst({
    where: { schoolId: school.id, isCurrent: true },
  });
  if (!year) throw new Error('No current academic year');

  const grades = await prisma.grade.findMany({
    where: { schoolId: school.id, name: { in: ['Level 1', 'Level 2'] } },
    include: {
      subjects: true,
      sections: {
        include: {
          classTeacher: { include: { user: { select: { firstName: true, lastName: true } } } },
        },
      },
    },
  });

  const result = [];
  for (const grade of grades) {
    await prisma.grade.update({
      where: { id: grade.id },
      data: { hasPeriodTimetable: false },
    });

    const section = grade.sections[0];
    if (!section) {
      result.push({ class: grade.name, error: 'No section' });
      continue;
    }

    const removed = await prisma.timetableSlot.deleteMany({
      where: { sectionId: section.id, academicYearId: year.id },
    });

    const teacherId = section.classTeacherId;
    let assigned = 0;
    if (teacherId) {
      for (const subject of grade.subjects) {
        await prisma.classSubject.upsert({
          where: {
            sectionId_subjectId_academicYearId: {
              sectionId: section.id,
              subjectId: subject.id,
              academicYearId: year.id,
            },
          },
          create: {
            sectionId: section.id,
            subjectId: subject.id,
            teacherId,
            academicYearId: year.id,
            branchId: section.branchId,
          },
          update: { teacherId },
        });
        await prisma.teacherSubject.upsert({
          where: {
            teacherId_subjectId_branchId_academicYearId: {
              teacherId,
              subjectId: subject.id,
              branchId: section.branchId,
              academicYearId: year.id,
            },
          },
          create: {
            teacherId,
            subjectId: subject.id,
            branchId: section.branchId,
            academicYearId: year.id,
          },
          update: {},
        });
        assigned += 1;
      }
    }

    result.push({
      class: grade.name,
      classTeacher: section.classTeacher
        ? `${section.classTeacher.user.firstName} ${section.classTeacher.user.lastName}`.trim()
        : null,
      hasPeriodTimetable: false,
      subjectsAssignedToClassTeacher: assigned,
      timetableSlotsRemoved: removed.count,
    });
  }

  const nineTen = await prisma.grade.findMany({
    where: { schoolId: school.id, name: { in: ['Class 9', 'Class 10'] } },
    include: {
      sections: { include: { _count: { select: { timetableSlots: true } } } },
    },
  });

  console.log(
    JSON.stringify(
      {
        prePrimary: result,
        class9and10: nineTen.map((grade) => ({
          class: grade.name,
          timetableSlots: grade.sections[0]?._count.timetableSlots ?? 0,
        })),
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
