import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcryptjs';
import {
  EnrollmentStatus,
  ParentRelationship,
  Prisma,
  PrismaClient,
  RoleName,
  StudentStatus,
  UserStatus,
} from '@prisma/client';
import {
  buildParentUsername,
  generateParentPassword,
  parentLocalEmail,
} from '../src/students/parent-accounts';

const prisma = new PrismaClient();
const CSV_PATH = path.resolve(__dirname, '../../../studentsList.csv');

type ParsedRow = {
  classCode: string;
  compNo: string;
  admissionDate: Date | null;
  studentName: string;
  fatherName: string;
  phone: string | null;
  phoneAlt: string | null;
};

function mapClassCode(code: string): string {
  const c = code.trim().toUpperCase();
  if (/^\d+$/.test(c)) return `Class ${Number(c)}`;
  if (c === 'P1') return 'Level 1';
  if (c === 'P2') return 'Level 2';
  if (c === 'NS') return 'Beginners';
  throw new Error(`Unknown class code: ${code}`);
}

function parseDate(value: string): Date | null {
  const m = value.trim().match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  year += year >= 70 ? 1900 : 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizePhone(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits || digits === '0' || digits.length < 10) return null;
  return digits;
}

function splitPersonName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (!parts.length) return { firstName: 'Unknown', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/);
  let classCode: string | null = null;
  const rows: ParsedRow[] = [];

  for (const line of lines) {
    const header = line.match(/Class:,,([^,]+)/);
    if (header) {
      classCode = header[1].trim();
      continue;
    }
    if (!classCode || !/^\d+,/.test(line)) continue;

    const cols = line.split(',');
    const compNo = (cols[1] || '').trim();
    const nameField = (cols[9] || '').trim();
    if (!compNo || !nameField.includes('/')) continue;

    const [studentRaw, fatherRaw] = nameField.split('/').map((part) => part.trim());
    if (!studentRaw || !fatherRaw) continue;

    const phone = normalizePhone(cols[19]);
    const phoneAlt = normalizePhone(cols[22]);

    rows.push({
      classCode,
      compNo,
      admissionDate: parseDate(cols[6] || ''),
      studentName: studentRaw,
      fatherName: fatherRaw,
      phone: phone || phoneAlt,
      phoneAlt: phone && phoneAlt && phoneAlt !== phone ? phoneAlt : null,
    });
  }
  return rows;
}

async function ensureBeginners(
  schoolId: string,
  branchId: string,
): Promise<{ gradeId: string; sectionId: string }> {
  const stage =
    (await prisma.schoolStage.findFirst({
      where: { schoolId, name: { contains: 'Pre' } },
    })) ??
    (await prisma.schoolStage.findFirst({ where: { schoolId }, orderBy: { sortOrder: 'asc' } }));

  const grade = await prisma.grade.upsert({
    where: { schoolId_name: { schoolId, name: 'Beginners' } },
    create: {
      schoolId,
      stageId: stage?.id,
      name: 'Beginners',
      level: 0,
      hasPeriodTimetable: false,
    },
    update: { stageId: stage?.id, hasPeriodTimetable: false },
  });

  const section = await prisma.section.upsert({
    where: { branchId_gradeId_name: { branchId, gradeId: grade.id, name: 'A' } },
    create: { schoolId, branchId, gradeId: grade.id, name: 'A' },
    update: {},
  });

  return { gradeId: grade.id, sectionId: section.id };
}

async function upsertFather(
  tx: Prisma.TransactionClient,
  args: {
    schoolId: string;
    schoolCode: string;
    studentId: string;
    studentCode: string;
    studentLastName: string;
    parentRoleId: string;
    fatherName: string;
    phone: string | null;
  },
) {
  const { firstName, lastName } = splitPersonName(args.fatherName);
  const fatherLast = !lastName || lastName === '-' ? args.studentLastName : lastName;
  const phone = args.phone;

  let existing = phone
    ? await tx.user.findFirst({
        where: { schoolId: args.schoolId, phone, parentProfile: { isNot: null } },
        include: { parentProfile: true, roles: { include: { role: true } } },
      })
    : null;

  if (existing) {
    const parentProfile =
      existing.parentProfile ??
      (await tx.parentProfile.create({
        data: { userId: existing.id, schoolId: args.schoolId, phone: phone ?? existing.phone },
      }));
    if (!existing.roles.some((r) => r.role.name === RoleName.PARENT)) {
      await tx.userRole.create({
        data: { userId: existing.id, roleId: args.parentRoleId, schoolId: args.schoolId },
      });
    }
    await tx.studentParent.upsert({
      where: { studentId_parentId: { studentId: args.studentId, parentId: parentProfile.id } },
      create: {
        studentId: args.studentId,
        parentId: parentProfile.id,
        relationship: ParentRelationship.FATHER,
        isPrimary: true,
      },
      update: { relationship: ParentRelationship.FATHER, isPrimary: true },
    });
    return { username: existing.username ?? existing.email, password: null as string | null, existing: true };
  }

  let username = buildParentUsername(args.schoolCode, phone);
  let attempt = 0;
  while (await tx.user.findUnique({ where: { username } })) {
    attempt += 1;
    username = buildParentUsername(args.schoolCode, phone, attempt);
  }

  const password = generateParentPassword();
  const parentUser = await tx.user.create({
    data: {
      email: parentLocalEmail(username, args.schoolCode),
      username,
      passwordHash: await bcrypt.hash(password, 12),
      firstName,
      lastName: fatherLast,
      phone,
      schoolId: args.schoolId,
      status: UserStatus.ACTIVE,
      mustChangePassword: true,
    },
  });
  await tx.userRole.create({
    data: { userId: parentUser.id, roleId: args.parentRoleId, schoolId: args.schoolId },
  });
  const parentProfile = await tx.parentProfile.create({
    data: { userId: parentUser.id, schoolId: args.schoolId, phone },
  });
  await tx.studentParent.create({
    data: {
      studentId: args.studentId,
      parentId: parentProfile.id,
      relationship: ParentRelationship.FATHER,
      isPrimary: true,
    },
  });

  return { username, password, existing: false };
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) throw new Error(`CSV not found: ${CSV_PATH}`);
  const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));
  if (!rows.length) throw new Error('No students parsed from CSV');

  const school = await prisma.school.findUnique({
    where: { code: 'TPS' },
    include: { branches: { take: 1 } },
  });
  if (!school?.branches[0]) throw new Error('School TPS or branch not found');

  const branchId = school.branches[0].id;
  const year = await prisma.academicYear.findFirst({
    where: { schoolId: school.id, isCurrent: true },
  });
  if (!year) throw new Error('No current academic year for TPS');

  const parentRole = await prisma.role.findUnique({ where: { name: RoleName.PARENT } });
  if (!parentRole) throw new Error('PARENT role missing');

  const grades = await prisma.grade.findMany({
    where: { schoolId: school.id },
    include: { sections: { where: { name: 'A' }, take: 1 } },
  });
  const gradeByName = new Map(grades.map((g) => [g.name, g]));

  if (!gradeByName.has('Beginners')) {
    const created = await ensureBeginners(school.id, branchId);
    const grade = await prisma.grade.findUniqueOrThrow({
      where: { id: created.gradeId },
      include: { sections: { where: { name: 'A' }, take: 1 } },
    });
    gradeByName.set('Beginners', grade);
  }

  const summary = {
    parsed: rows.length,
    created: 0,
    skippedExisting: 0,
    errors: [] as Array<{ compNo: string; error: string }>,
    byClass: {} as Record<string, number>,
  };
  const credentials: Array<{
    studentCode: string;
    student: string;
    className: string;
    fatherUsername: string;
    fatherPassword: string | null;
  }> = [];

  for (const row of rows) {
    const className = mapClassCode(row.classCode);
    const grade = gradeByName.get(className);
    const section = grade?.sections[0];
    if (!grade || !section) {
      summary.errors.push({ compNo: row.compNo, error: `Missing class/section for ${className}` });
      continue;
    }

    const existing = await prisma.student.findUnique({
      where: { schoolId_studentCode: { schoolId: school.id, studentCode: row.compNo } },
    });
    if (existing) {
      summary.skippedExisting += 1;
      continue;
    }

    const studentNames = splitPersonName(row.studentName);
    try {
      const result = await prisma.$transaction(async (tx) => {
        const student = await tx.student.create({
          data: {
            schoolId: school.id,
            branchId,
            studentCode: row.compNo,
            admissionNumber: row.compNo,
            firstName: studentNames.firstName,
            lastName: studentNames.lastName,
            status: StudentStatus.ACTIVE,
          },
        });

        await tx.studentEnrollment.create({
          data: {
            studentId: student.id,
            academicYearId: year.id,
            gradeId: grade.id,
            sectionId: section.id,
            enrollmentDate: row.admissionDate ?? new Date(),
            status: EnrollmentStatus.ACTIVE,
          },
        });

        const father = await upsertFather(tx, {
          schoolId: school.id,
          schoolCode: school.code,
          studentId: student.id,
          studentCode: row.compNo,
          studentLastName: studentNames.lastName,
          parentRoleId: parentRole.id,
          fatherName: row.fatherName,
          phone: row.phone,
        });

        return { student, father };
      });

      summary.created += 1;
      summary.byClass[className] = (summary.byClass[className] ?? 0) + 1;
      credentials.push({
        studentCode: row.compNo,
        student: `${studentNames.firstName} ${studentNames.lastName}`.trim(),
        className,
        fatherUsername: result.father.username,
        fatherPassword: result.father.password,
      });
    } catch (err) {
      summary.errors.push({
        compNo: row.compNo,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const outPath = path.resolve(__dirname, 'tps-parent-credentials.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        importedAt: new Date().toISOString(),
        school: school.name,
        credentials: credentials.filter((c) => c.fatherPassword),
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        ...summary,
        credentialsFile: outPath,
        newParentLogins: credentials.filter((c) => c.fatherPassword).length,
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
