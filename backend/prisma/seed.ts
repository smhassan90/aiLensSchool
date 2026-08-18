import {
  AttendanceStatus,
  EnrollmentStatus,
  FeeFrequency,
  Gender,
  LessonStatus,
  LessonSourceType,
  ParentRelationship,
  PrismaClient,
  QuestionSource,
  QuestionType,
  QuizStatus,
  RoleName,
  SchoolStatus,
  StudentFeeStatus,
  StudentStatus,
  SubscriptionStatus,
  TeacherStatus,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SUBJECTS = [
  { key: 'ENG', name: 'English' },
  { key: 'URD', name: 'Urdu' },
  { key: 'MATH', name: 'Mathematics' },
  { key: 'SCI', name: 'Science' },
  { key: 'ISL', name: 'Islamiat' },
  { key: 'SST', name: 'Social Studies' },
  { key: 'CMP', name: 'Computer' },
  { key: 'ART', name: 'Arts' },
] as const;

const TEACHER_STAFF: Array<{
  subject: (typeof SUBJECTS)[number]['key'];
  band: 'junior' | 'senior';
  firstName: string;
  lastName: string;
  email: string;
  code: string;
}> = [
  { subject: 'ENG', band: 'junior', firstName: 'Ayesha', lastName: 'Malik', email: 'ayesha.malik@thewisdomschool.com', code: 'T-101' },
  { subject: 'ENG', band: 'senior', firstName: 'Nadia', lastName: 'Hussain', email: 'nadia.hussain@thewisdomschool.com', code: 'T-102' },
  { subject: 'URD', band: 'junior', firstName: 'Farah', lastName: 'Siddiqui', email: 'farah.siddiqui@thewisdomschool.com', code: 'T-103' },
  { subject: 'URD', band: 'senior', firstName: 'Asma', lastName: 'Raza', email: 'asma.raza@thewisdomschool.com', code: 'T-104' },
  { subject: 'MATH', band: 'junior', firstName: 'Fatima', lastName: 'Khan', email: 'teacher@abcschool.com', code: 'T-001' },
  { subject: 'MATH', band: 'senior', firstName: 'Imran', lastName: 'Qureshi', email: 'imran.qureshi@thewisdomschool.com', code: 'T-105' },
  { subject: 'SCI', band: 'junior', firstName: 'Sana', lastName: 'Iqbal', email: 'sana.iqbal@thewisdomschool.com', code: 'T-106' },
  { subject: 'SCI', band: 'senior', firstName: 'Ahmed', lastName: 'Sheikh', email: 'ahmed.sheikh@thewisdomschool.com', code: 'T-107' },
  { subject: 'ISL', band: 'junior', firstName: 'Maryam', lastName: 'Noor', email: 'maryam.noor@thewisdomschool.com', code: 'T-108' },
  { subject: 'ISL', band: 'senior', firstName: 'Tariq', lastName: 'Mehmood', email: 'tariq.mehmood@thewisdomschool.com', code: 'T-109' },
  { subject: 'SST', band: 'junior', firstName: 'Hina', lastName: 'Shah', email: 'hina.shah@thewisdomschool.com', code: 'T-110' },
  { subject: 'SST', band: 'senior', firstName: 'Bilal', lastName: 'Ansari', email: 'bilal.ansari@thewisdomschool.com', code: 'T-111' },
  { subject: 'CMP', band: 'junior', firstName: 'Zara', lastName: 'Kamal', email: 'zara.kamal@thewisdomschool.com', code: 'T-112' },
  { subject: 'CMP', band: 'senior', firstName: 'Usman', lastName: 'Tariq', email: 'usman.tariq@thewisdomschool.com', code: 'T-113' },
  { subject: 'ART', band: 'junior', firstName: 'Mehwish', lastName: 'Javed', email: 'mehwish.javed@thewisdomschool.com', code: 'T-114' },
  { subject: 'ART', band: 'senior', firstName: 'Sara', lastName: 'Baig', email: 'sara.baig@thewisdomschool.com', code: 'T-115' },
];

const BOYS = ['Ahmed', 'Ali', 'Hassan', 'Omar', 'Yusuf', 'Ibrahim', 'Hamza', 'Zain', 'Rayyan', 'Mustafa', 'Bilal', 'Daniyal', 'Faizan', 'Haris', 'Sami', 'Arham', 'Huzaifa', 'Rehan'];
const GIRLS = ['Ayesha', 'Fatima', 'Zara', 'Hira', 'Mariam', 'Noor', 'Sara', 'Laiba', 'Amina', 'Hania', 'Eman', 'Iqra', 'Mahnoor', 'Alina', 'Dua', 'Haleema', 'Inaya', 'Minahil'];
const LAST_NAMES = ['Khan', 'Ahmed', 'Ali', 'Hassan', 'Malik', 'Sheikh', 'Qureshi', 'Siddiqui', 'Raza', 'Shah', 'Butt', 'Chaudhry', 'Mirza', 'Ansari', 'Javed', 'Iqbal', 'Akhtar', 'Farooq', 'Nawaz', 'Baig'];

const ATTENDANCE_DAYS = [
  '2026-08-03',
  '2026-08-04',
  '2026-08-05',
  '2026-08-06',
  '2026-08-07',
  '2026-08-10',
  '2026-08-11',
  '2026-08-12',
  '2026-08-13',
  '2026-08-14',
];

async function createManyChunked<T extends object>(
  createMany: (args: { data: T[]; skipDuplicates: boolean }) => Promise<unknown>,
  data: T[],
  size = 200,
) {
  for (let i = 0; i < data.length; i += size) {
    await createMany({ data: data.slice(i, i + size), skipDuplicates: true });
  }
}

function homeAddress(grade: number, section: string, index: number) {
  const areas = ['Gulshan-e-Iqbal', 'DHA Phase 6', 'North Nazimabad', 'PECHS', 'Clifton Block 2', 'Gulistan-e-Jauhar'];
  const area = areas[(grade + index) % areas.length];
  return `House ${10 + index}, Street ${grade}, ${section} Block, ${area}, Karachi`;
}

function sectionSize(grade: number, section: string) {
  return 20 + ((grade * 3 + (section === 'A' ? 0 : 4)) % 6);
}

function attendanceStatus(seed: number): AttendanceStatus {
  const r = seed % 100;
  if (r < 88) return AttendanceStatus.PRESENT;
  if (r < 93) return AttendanceStatus.LATE;
  if (r < 98) return AttendanceStatus.ABSENT;
  return AttendanceStatus.EXCUSED;
}

function studentCode(grade: number, section: string, index: number) {
  if (grade === 5 && section === 'A' && index === 1) return 'STU-001';
  if (grade === 2 && section === 'B' && index === 1) return 'STU-002';
  if (grade === 1 && section === 'A' && index === 1) return 'STU-003';
  return `TWS-${String(grade).padStart(2, '0')}${section}${String(index).padStart(2, '0')}`;
}

async function main() {
  console.log('Seeding The Wisdom School...');

  for (const name of Object.values(RoleName)) {
    await prisma.role.upsert({
      where: { name },
      create: { name, description: `${name} role` },
      update: {},
    });
  }

  const plan = await prisma.pricingPlan.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Standard PKR',
      pricePerStudent: 100,
      minimumMonthlyFee: 5000,
      currency: 'PKR',
      active: true,
      description: '100 PKR per active student, minimum 5000 PKR / month / branch',
    },
    update: {
      pricePerStudent: 100,
      minimumMonthlyFee: 5000,
      active: true,
    },
  });

  const superHash = await bcrypt.hash('SuperAdmin123!', 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@example.com' },
    create: {
      email: 'superadmin@example.com',
      username: 'superadmin',
      passwordHash: superHash,
      firstName: 'Super',
      lastName: 'Admin',
      status: UserStatus.ACTIVE,
    },
    update: { passwordHash: superHash, status: UserStatus.ACTIVE, username: 'superadmin' },
  });
  const superRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.SUPER_ADMIN } });
  const existingSuperRole = await prisma.userRole.findFirst({
    where: { userId: superAdmin.id, roleId: superRole.id, schoolId: null },
  });
  if (!existingSuperRole) {
    await prisma.userRole.create({
      data: { userId: superAdmin.id, roleId: superRole.id, schoolId: null },
    });
  }

  const school = await prisma.school.upsert({
    where: { code: 'ABC' },
    create: {
      name: 'The Wisdom School',
      code: 'ABC',
      email: 'info@thewisdomschool.com',
      phone: '+92-21-35301234',
      address: 'Shahrah-e-Faisal, Karachi',
      city: 'Karachi',
      country: 'Pakistan',
      status: SchoolStatus.ACTIVE,
      pricingPlanId: plan.id,
    },
    update: {
      name: 'The Wisdom School',
      email: 'info@thewisdomschool.com',
      phone: '+92-21-35301234',
      address: 'Shahrah-e-Faisal, Karachi',
      city: 'Karachi',
      status: SchoolStatus.ACTIVE,
      pricingPlanId: plan.id,
    },
  });

  await prisma.schoolSettings.upsert({
    where: { schoolId: school.id },
    create: { schoolId: school.id, setupCompleted: true, examPattern: 'MID_FINAL' },
    update: { setupCompleted: true },
  });

  await prisma.schoolSubscription.upsert({
    where: { schoolId: school.id },
    create: {
      schoolId: school.id,
      pricingPlanId: plan.id,
      status: SubscriptionStatus.ACTIVE,
      startsAt: new Date(),
    },
    update: { pricingPlanId: plan.id, status: SubscriptionStatus.ACTIVE },
  });

  const mainBranch = await prisma.branch.upsert({
    where: { schoolId_code: { schoolId: school.id, code: 'MAIN' } },
    create: {
      schoolId: school.id,
      name: 'Main Campus',
      code: 'MAIN',
      address: 'Shahrah-e-Faisal, Karachi',
    },
    update: { name: 'Main Campus', address: 'Shahrah-e-Faisal, Karachi' },
  });

  await prisma.branch.upsert({
    where: { schoolId_code: { schoolId: school.id, code: 'SECOND' } },
    create: {
      schoolId: school.id,
      name: 'Second Campus',
      code: 'SECOND',
      address: 'DHA, Karachi',
    },
    update: { name: 'Second Campus' },
  });

  const adminHash = await bcrypt.hash('SchoolAdmin123!', 12);
  const schoolAdmin = await prisma.user.upsert({
    where: { email: 'admin@abcschool.com' },
    create: {
      email: 'admin@abcschool.com',
      username: 'schooladmin',
      passwordHash: adminHash,
      firstName: 'School',
      lastName: 'Admin',
      schoolId: school.id,
      status: UserStatus.ACTIVE,
    },
    update: {
      passwordHash: adminHash,
      schoolId: school.id,
      status: UserStatus.ACTIVE,
      username: 'schooladmin',
    },
  });
  const schoolAdminRole = await prisma.role.findUniqueOrThrow({
    where: { name: RoleName.SCHOOL_ADMIN },
  });
  const existingAdminRole = await prisma.userRole.findFirst({
    where: { userId: schoolAdmin.id, roleId: schoolAdminRole.id, schoolId: school.id },
  });
  if (!existingAdminRole) {
    await prisma.userRole.create({
      data: { userId: schoolAdmin.id, roleId: schoolAdminRole.id, schoolId: school.id },
    });
  }

  const principalHash = await bcrypt.hash('Principal123!', 12);
  const principal = await prisma.user.upsert({
    where: { email: 'principal@abcschool.com' },
    create: {
      email: 'principal@abcschool.com',
      username: 'principal',
      passwordHash: principalHash,
      firstName: 'School',
      lastName: 'Principal',
      schoolId: school.id,
      status: UserStatus.ACTIVE,
      permissions: ['VIEW_DASHBOARD', 'SEARCH_STUDENTS', 'VIEW_TEACHER_PROGRESS', 'VIEW_FINANCE'],
    },
    update: {
      passwordHash: principalHash,
      schoolId: school.id,
      permissions: ['VIEW_DASHBOARD', 'SEARCH_STUDENTS', 'VIEW_TEACHER_PROGRESS', 'VIEW_FINANCE'],
    },
  });
  const principalRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.PRINCIPAL } });
  const existingPrincipalRole = await prisma.userRole.findFirst({
    where: { userId: principal.id, roleId: principalRole.id, schoolId: school.id },
  });
  if (!existingPrincipalRole) {
    await prisma.userRole.create({
      data: { userId: principal.id, roleId: principalRole.id, schoolId: school.id },
    });
  }

  const year = await prisma.academicYear.upsert({
    where: { id: '00000000-0000-4000-8000-000000000010' },
    create: {
      id: '00000000-0000-4000-8000-000000000010',
      schoolId: school.id,
      branchId: mainBranch.id,
      name: '2025-2026',
      startDate: new Date('2025-08-01'),
      endDate: new Date('2026-06-30'),
      isCurrent: true,
    },
    update: { isCurrent: true, name: '2025-2026' },
  });

  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.TEACHER } });
  const parentRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.PARENT } });
  const teacherHash = await bcrypt.hash('Teacher123!', 12);
  const parentHash = await bcrypt.hash('Parent123!', 12);

  console.log('Creating grades, sections and subjects...');
  const grades: Record<number, { id: string; name: string; level: number }> = {};
  const sections: Record<string, { id: string; name: string; gradeId: string }> = {};
  const subjects: Record<string, { id: string; name: string; code: string; grade: number }> = {};

  for (let level = 1; level <= 10; level++) {
    const grade = await prisma.grade.upsert({
      where: { schoolId_name: { schoolId: school.id, name: `Grade ${level}` } },
      create: { schoolId: school.id, name: `Grade ${level}`, level },
      update: { level },
    });
    grades[level] = grade;

    for (const name of ['A', 'B'] as const) {
      const section = await prisma.section.upsert({
        where: {
          branchId_gradeId_name: {
            branchId: mainBranch.id,
            gradeId: grade.id,
            name,
          },
        },
        create: {
          schoolId: school.id,
          branchId: mainBranch.id,
          gradeId: grade.id,
          name,
          capacity: 30,
        },
        update: { capacity: 30 },
      });
      sections[`${level}${name}`] = { id: section.id, name, gradeId: grade.id };
    }

    for (const subject of SUBJECTS) {
      const code = `${subject.key}${level}`;
      const row = await prisma.subject.upsert({
        where: { schoolId_code: { schoolId: school.id, code } },
        create: {
          schoolId: school.id,
          gradeId: grade.id,
          name: subject.name,
          code,
        },
        update: { name: subject.name, gradeId: grade.id },
      });
      subjects[code] = { id: row.id, name: row.name, code, grade: level };
    }
  }

  console.log('Creating subject teachers (junior 1-5, senior 6-10)...');
  const teacherByKey: Record<string, { profileId: string; userId: string }> = {};

  for (const staff of TEACHER_STAFF) {
    const username = staff.email.split('@')[0].replace(/\./g, '');
    const user = await prisma.user.upsert({
      where: { email: staff.email },
      create: {
        email: staff.email,
        username,
        passwordHash: teacherHash,
        firstName: staff.firstName,
        lastName: staff.lastName,
        schoolId: school.id,
        status: UserStatus.ACTIVE,
        mustChangePassword: false,
      },
      update: {
        passwordHash: teacherHash,
        schoolId: school.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        username,
        status: UserStatus.ACTIVE,
        mustChangePassword: false,
      },
    });
    const roleLink = await prisma.userRole.findFirst({
      where: { userId: user.id, roleId: teacherRole.id, schoolId: school.id },
    });
    if (!roleLink) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: teacherRole.id, schoolId: school.id },
      });
    }
    const profile = await prisma.teacherProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        schoolId: school.id,
        branchId: mainBranch.id,
        employeeCode: staff.code,
        status: TeacherStatus.ACTIVE,
        hireDate: new Date(staff.band === 'junior' ? '2023-08-01' : '2022-08-01'),
      },
      update: {
        branchId: mainBranch.id,
        employeeCode: staff.code,
        status: TeacherStatus.ACTIVE,
      },
    });
    teacherByKey[`${staff.subject}:${staff.band}`] = { profileId: profile.id, userId: user.id };
  }

  const classSubjects: Array<{
    sectionId: string;
    subjectId: string;
    academicYearId: string;
    branchId: string;
    teacherId: string;
  }> = [];
  const teacherSubjects: Array<{
    teacherId: string;
    subjectId: string;
    branchId: string;
    academicYearId: string;
  }> = [];

  for (let level = 1; level <= 10; level++) {
    const band = level <= 5 ? 'junior' : 'senior';
    for (const subject of SUBJECTS) {
      const teacher = teacherByKey[`${subject.key}:${band}`];
      const subjectRow = subjects[`${subject.key}${level}`];
      teacherSubjects.push({
        teacherId: teacher.profileId,
        subjectId: subjectRow.id,
        branchId: mainBranch.id,
        academicYearId: year.id,
      });
      for (const name of ['A', 'B'] as const) {
        classSubjects.push({
          sectionId: sections[`${level}${name}`].id,
          subjectId: subjectRow.id,
          academicYearId: year.id,
          branchId: mainBranch.id,
          teacherId: teacher.profileId,
        });
      }
    }
  }

  await createManyChunked(prisma.classSubject.createMany.bind(prisma.classSubject), classSubjects);
  await createManyChunked(prisma.teacherSubject.createMany.bind(prisma.teacherSubject), teacherSubjects);

  console.log('Creating students and parents...');
  const parentUsers: Array<{
    email: string;
    username: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    schoolId: string;
    status: UserStatus;
    mustChangePassword: boolean;
    phone: string;
  }> = [];
  const studentRows: Array<{
    code: string;
    admission: string;
    firstName: string;
    lastName: string;
    gender: Gender;
    dob: Date;
    parentEmail: string;
    parentFirst: string;
    grade: number;
    section: string;
    index: number;
  }> = [];

  let admissionSeq = 1;
  for (let level = 1; level <= 10; level++) {
    for (const name of ['A', 'B'] as const) {
      const count = sectionSize(level, name);
      for (let index = 1; index <= count; index++) {
        const code = studentCode(level, name, index);
        const boy = code === 'STU-002' ? false : code === 'STU-001' || code === 'STU-003' ? true : index % 2 === 1;
        const firstName =
          code === 'STU-001'
            ? 'Ahmed'
            : code === 'STU-002'
              ? 'Ayesha'
              : code === 'STU-003'
                ? 'Ali'
                : boy
                  ? BOYS[(index + level) % BOYS.length]
                  : GIRLS[(index + level) % GIRLS.length];
        const lastName =
          code === 'STU-001'
            ? 'Imran'
            : code === 'STU-002'
              ? 'Ali'
              : code === 'STU-003'
                ? 'Hassan'
                : LAST_NAMES[(level * 5 + index) % LAST_NAMES.length];
        const parentEmail =
          code === 'STU-001' || code === 'STU-002' || code === 'STU-003'
            ? 'parent1@example.com'
            : `parent.${code.toLowerCase()}@thewisdomschool.com`;
        const parentFirst = lastName;
        parentUsers.push({
          email: parentEmail,
          username: parentEmail === 'parent1@example.com' ? 'abc.f.stu001' : `tws.p.${code.toLowerCase()}`,
          passwordHash: parentHash,
          firstName: parentEmail === 'parent1@example.com' ? 'Imran' : parentFirst,
          lastName: parentEmail === 'parent1@example.com' ? 'Ahmed' : firstName,
          schoolId: school.id,
          status: UserStatus.ACTIVE,
          mustChangePassword: false,
          phone: `+92-300-${String(1000000 + admissionSeq).slice(-7)}`,
        });
        studentRows.push({
          code,
          admission: code.startsWith('STU-') ? `ADM-00${code.slice(-1)}` : `ADM-2025-${String(admissionSeq).padStart(4, '0')}`,
          firstName,
          lastName,
          gender: boy ? Gender.MALE : Gender.FEMALE,
          dob: new Date(`${2019 - (level - 1)}-0${(index % 8) + 1}-15`),
          parentEmail,
          parentFirst,
          grade: level,
          section: name,
          index,
        });
        admissionSeq += 1;
      }
    }
  }

  const uniqueParents = new Map(parentUsers.map((row) => [row.email, row]));
  await createManyChunked(
    prisma.user.createMany.bind(prisma.user),
    [...uniqueParents.values()].map(({ phone, ...user }) => user),
  );

  const parentUserRows = await prisma.user.findMany({
    where: { email: { in: [...uniqueParents.keys()] } },
    select: { id: true, email: true },
  });
  await createManyChunked(
    prisma.userRole.createMany.bind(prisma.userRole),
    parentUserRows.map((user) => ({ userId: user.id, roleId: parentRole.id, schoolId: school.id })),
  );
  await createManyChunked(
    prisma.parentProfile.createMany.bind(prisma.parentProfile),
    parentUserRows.map((user) => ({
      userId: user.id,
      schoolId: school.id,
      phone: uniqueParents.get(user.email)?.phone,
    })),
  );

  const parentProfiles = await prisma.parentProfile.findMany({
    where: { userId: { in: parentUserRows.map((user) => user.id) } },
    select: { id: true, userId: true, user: { select: { email: true } } },
  });
  const parentIdByEmail = new Map(parentProfiles.map((row) => [row.user.email, row.id]));

  await createManyChunked(
    prisma.student.createMany.bind(prisma.student),
    studentRows.map((row) => ({
      schoolId: school.id,
      branchId: mainBranch.id,
      studentCode: row.code,
      admissionNumber: row.admission,
      firstName: row.firstName,
      lastName: row.lastName,
      gender: row.gender,
      status: StudentStatus.ACTIVE,
      dateOfBirth: row.dob,
      address: homeAddress(row.grade, row.section, row.index),
    })),
  );

  await prisma.$executeRaw`
    UPDATE students
    SET address = CONCAT(
      'House ', (CRC32(student_code) % 90) + 10,
      ', Street ', (CRC32(student_code) % 18) + 1,
      ', ',
      ELT((CRC32(student_code) % 6) + 1, 'Gulshan-e-Iqbal', 'DHA Phase 6', 'North Nazimabad', 'PECHS', 'Clifton Block 2', 'Gulistan-e-Jauhar'),
      ', Karachi'
    )
    WHERE school_id = ${school.id}
      AND (address IS NULL OR address = '')
  `;

  const students = await prisma.student.findMany({
    where: { schoolId: school.id, studentCode: { in: studentRows.map((row) => row.code) } },
    select: { id: true, studentCode: true },
  });
  const studentIdByCode = new Map(students.map((row) => [row.studentCode, row.id]));

  const existingEnrollments = await prisma.studentEnrollment.findMany({
    where: { academicYearId: year.id, studentId: { in: students.map((row) => row.id) } },
    select: { studentId: true },
  });
  const enrolled = new Set(existingEnrollments.map((row) => row.studentId));
  await createManyChunked(
    prisma.studentEnrollment.createMany.bind(prisma.studentEnrollment),
    studentRows
      .map((row) => {
        const studentId = studentIdByCode.get(row.code);
        if (!studentId || enrolled.has(studentId)) return null;
        return {
          studentId,
          academicYearId: year.id,
          gradeId: grades[row.grade].id,
          sectionId: sections[`${row.grade}${row.section}`].id,
          enrollmentDate: new Date('2025-08-15'),
          status: EnrollmentStatus.ACTIVE,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row)),
  );

  await createManyChunked(
    prisma.studentParent.createMany.bind(prisma.studentParent),
    studentRows
      .map((row) => {
        const studentId = studentIdByCode.get(row.code);
        const parentId = parentIdByEmail.get(row.parentEmail);
        if (!studentId || !parentId) return null;
        return {
          studentId,
          parentId,
          relationship: ParentRelationship.FATHER,
          isPrimary: true,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row)),
  );

  const parentTwo = await prisma.user.upsert({
    where: { email: 'parent2@example.com' },
    create: {
      email: 'parent2@example.com',
      username: 'abc.m.stu001',
      passwordHash: parentHash,
      firstName: 'Sana',
      lastName: 'Ali',
      schoolId: school.id,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
    },
    update: { passwordHash: parentHash, schoolId: school.id, username: 'abc.m.stu001', mustChangePassword: false },
  });
  const parentTwoRole = await prisma.userRole.findFirst({
    where: { userId: parentTwo.id, roleId: parentRole.id, schoolId: school.id },
  });
  if (!parentTwoRole) {
    await prisma.userRole.create({
      data: { userId: parentTwo.id, roleId: parentRole.id, schoolId: school.id },
    });
  }
  const parentTwoProfile = await prisma.parentProfile.upsert({
    where: { userId: parentTwo.id },
    create: { userId: parentTwo.id, schoolId: school.id, phone: '+92-300-1111112' },
    update: { schoolId: school.id },
  });
  const ahmedId = studentIdByCode.get('STU-001');
  if (ahmedId) {
    await prisma.studentParent.upsert({
      where: { studentId_parentId: { studentId: ahmedId, parentId: parentTwoProfile.id } },
      create: {
        studentId: ahmedId,
        parentId: parentTwoProfile.id,
        relationship: ParentRelationship.MOTHER,
        isPrimary: false,
      },
      update: {},
    });
  }

  console.log('Marking attendance for school days...');
  const attendanceRows = studentRows.flatMap((row, studentIndex) => {
    const studentId = studentIdByCode.get(row.code);
    if (!studentId) return [];
    return ATTENDANCE_DAYS.map((day, dayIndex) => ({
      schoolId: school.id,
      branchId: mainBranch.id,
      academicYearId: year.id,
      sectionId: sections[`${row.grade}${row.section}`].id,
      studentId,
      date: new Date(day),
      status: attendanceStatus(studentIndex * 17 + dayIndex * 31 + row.grade * 7),
    }));
  });
  await createManyChunked(prisma.attendance.createMany.bind(prisma.attendance), attendanceRows, 400);

  const grade5 = grades[5];
  const sectionA = sections['5A'];
  const math = subjects.MATH5;
  const teacherUserId = teacherByKey['MATH:junior'].userId;
  const teacherProfileId = teacherByKey['MATH:junior'].profileId;
  const ahmed = ahmedId
    ? await prisma.student.findUniqueOrThrow({ where: { id: ahmedId } })
    : await prisma.student.findFirstOrThrow({
        where: { schoolId: school.id, studentCode: 'STU-001' },
      });
  const ayesha = await prisma.student.findFirstOrThrow({
    where: { schoolId: school.id, studentCode: 'STU-002' },
  });

  const lesson = await prisma.dailyLesson.upsert({
    where: { id: '00000000-0000-4000-8000-000000000020' },
    create: {
      id: '00000000-0000-4000-8000-000000000020',
      schoolId: school.id,
      branchId: mainBranch.id,
      academicYearId: year.id,
      gradeId: grade5.id,
      sectionId: sectionA.id,
      subjectId: math.id,
      teacherId: teacherProfileId,
      createdById: teacherUserId,
      date: new Date('2026-08-10'),
      chapterName: 'Fractions',
      topicName: 'Adding fractions',
      teacherNotes: 'Use visual fraction bars.',
      aiSummary: 'Students learned how to add fractions with like denominators.',
      status: LessonStatus.CONFIRMED,
      confirmedAt: new Date('2026-08-10'),
      sources: {
        create: {
          type: LessonSourceType.MANUAL_TEXT,
          manualText: 'Adding fractions with the same denominator. Example: 1/4 + 2/4 = 3/4.',
        },
      },
      concepts: {
        create: [{ name: 'Like denominators' }, { name: 'Fraction addition' }],
      },
    },
    update: {
      status: LessonStatus.CONFIRMED,
      aiSummary: 'Students learned how to add fractions with like denominators.',
    },
  });

  await prisma.homework.upsert({
    where: { id: '00000000-0000-4000-8000-000000000030' },
    create: {
      id: '00000000-0000-4000-8000-000000000030',
      schoolId: school.id,
      branchId: mainBranch.id,
      academicYearId: year.id,
      sectionId: sectionA.id,
      subjectId: math.id,
      lessonId: lesson.id,
      createdById: teacherUserId,
      title: 'Fractions practice worksheet',
      description: 'Complete exercises 1-10 on adding fractions.',
      dueDate: new Date('2026-08-14'),
      publishedAt: new Date('2026-08-10'),
    },
    update: { title: 'Fractions practice worksheet' },
  });

  const quiz = await prisma.quiz.upsert({
    where: { id: '00000000-0000-4000-8000-000000000040' },
    create: {
      id: '00000000-0000-4000-8000-000000000040',
      schoolId: school.id,
      branchId: mainBranch.id,
      academicYearId: year.id,
      sectionId: sectionA.id,
      subjectId: math.id,
      title: 'Fractions Quiz (Draft)',
      description: 'Draft quiz generated from confirmed fractions lesson',
      status: QuizStatus.DRAFT,
      createdById: teacherUserId,
      lessonDateFrom: new Date('2026-08-10'),
      lessonDateTo: new Date('2026-08-10'),
      totalMarks: 5,
      questions: {
        create: [
          {
            type: QuestionType.MCQ,
            questionText: 'What is 1/4 + 2/4?',
            marks: 1,
            correctAnswer: '3/4',
            order: 0,
            source: QuestionSource.AI,
            included: true,
            options: {
              create: [
                { optionText: '3/4', isCorrect: true, order: 0 },
                { optionText: '2/4', isCorrect: false, order: 1 },
                { optionText: '1/2', isCorrect: false, order: 2 },
                { optionText: '4/4', isCorrect: false, order: 3 },
              ],
            },
          },
          {
            type: QuestionType.TRUE_FALSE,
            questionText: 'Fractions with the same denominator are like fractions.',
            marks: 1,
            correctAnswer: 'true',
            order: 1,
            source: QuestionSource.AI,
            included: true,
          },
        ],
      },
    },
    update: { status: QuizStatus.DRAFT, title: 'Fractions Quiz (Draft)' },
  });

  const publishedQuiz = await prisma.quiz.upsert({
    where: { id: '00000000-0000-4000-8000-000000000041' },
    create: {
      id: '00000000-0000-4000-8000-000000000041',
      schoolId: school.id,
      branchId: mainBranch.id,
      academicYearId: year.id,
      sectionId: sectionA.id,
      subjectId: math.id,
      title: 'Weekly Mathematics Quiz',
      description: 'Published quiz on equivalent and like fractions',
      status: QuizStatus.PUBLISHED,
      publishedAt: new Date('2026-08-11'),
      createdById: teacherUserId,
      lessonDateFrom: new Date('2026-08-10'),
      lessonDateTo: new Date('2026-08-10'),
      totalMarks: 2,
      questions: {
        create: [
          {
            type: QuestionType.MCQ,
            questionText: 'What is 1/4 + 2/4?',
            marks: 1,
            correctAnswer: '3/4',
            order: 0,
            source: QuestionSource.AI,
            included: true,
            options: {
              create: [
                { optionText: '3/4', isCorrect: true, order: 0 },
                { optionText: '2/4', isCorrect: false, order: 1 },
                { optionText: '1/2', isCorrect: false, order: 2 },
                { optionText: '4/4', isCorrect: false, order: 3 },
              ],
            },
          },
          {
            type: QuestionType.FILL_IN_THE_BLANK,
            questionText: 'Fractions with the same denominator are called ____ fractions.',
            marks: 1,
            correctAnswer: 'like',
            order: 1,
            source: QuestionSource.MANUAL,
            included: true,
          },
        ],
      },
      assignments: { create: [{ sectionId: sectionA.id }] },
    },
    update: { status: QuizStatus.PUBLISHED, publishedAt: new Date('2026-08-11') },
  });

  const attemptAhmed = await prisma.quizAttempt.upsert({
    where: { quizId_studentId: { quizId: publishedQuiz.id, studentId: ahmed.id } },
    create: {
      quizId: publishedQuiz.id,
      studentId: ahmed.id,
      startedAt: new Date('2026-08-12T08:00:00'),
      submittedAt: new Date('2026-08-12T08:12:00'),
      timeTaken: 720,
    },
    update: { submittedAt: new Date('2026-08-12T08:12:00') },
  });
  await prisma.quizResult.upsert({
    where: { attemptId: attemptAhmed.id },
    create: {
      quizId: publishedQuiz.id,
      studentId: ahmed.id,
      attemptId: attemptAhmed.id,
      score: 2,
      totalMarks: 2,
      percentage: 100,
      startedAt: attemptAhmed.startedAt,
      submittedAt: new Date('2026-08-12T08:12:00'),
      timeTaken: 720,
    },
    update: { score: 2, percentage: 100 },
  });

  const attemptAyesha = await prisma.quizAttempt.upsert({
    where: { quizId_studentId: { quizId: publishedQuiz.id, studentId: ayesha.id } },
    create: {
      quizId: publishedQuiz.id,
      studentId: ayesha.id,
      startedAt: new Date('2026-08-12T09:00:00'),
      submittedAt: new Date('2026-08-12T09:15:00'),
      timeTaken: 900,
    },
    update: {},
  });
  await prisma.quizResult.upsert({
    where: { attemptId: attemptAyesha.id },
    create: {
      quizId: publishedQuiz.id,
      studentId: ayesha.id,
      attemptId: attemptAyesha.id,
      score: 1,
      totalMarks: 2,
      percentage: 50,
      startedAt: attemptAyesha.startedAt,
      submittedAt: new Date('2026-08-12T09:15:00'),
      timeTaken: 900,
    },
    update: { score: 1, percentage: 50 },
  });

  const tuition = await prisma.feeStructure.upsert({
    where: { schoolId_name: { schoolId: school.id, name: 'Monthly Tuition' } },
    create: {
      schoolId: school.id,
      name: 'Monthly Tuition',
      amount: 5000,
      frequency: FeeFrequency.MONTHLY,
      description: 'Regular monthly tuition',
    },
    update: { amount: 5000, active: true },
  });
  const ahmedFee = await prisma.studentFee.upsert({
    where: {
      studentId_feeStructureId_periodLabel: {
        studentId: ahmed.id,
        feeStructureId: tuition.id,
        periodLabel: 'August 2026',
      },
    },
    create: {
      schoolId: school.id,
      branchId: mainBranch.id,
      studentId: ahmed.id,
      feeStructureId: tuition.id,
      academicYearId: year.id,
      sectionId: sectionA.id,
      periodLabel: 'August 2026',
      amount: 5000,
      paidAmount: 2500,
      dueDate: new Date('2026-08-10'),
      status: StudentFeeStatus.PARTIAL,
    },
    update: { amount: 5000, paidAmount: 2500, status: StudentFeeStatus.PARTIAL },
  });
  const existingPayment = await prisma.feePayment.findFirst({ where: { studentFeeId: ahmedFee.id } });
  if (!existingPayment) {
    await prisma.feePayment.create({
      data: {
        studentFeeId: ahmedFee.id,
        amount: 2500,
        method: 'CASH',
        reference: 'RCPT-001',
        recordedById: schoolAdmin.id,
      },
    });
  }

  await prisma.homeDiary.upsert({
    where: { sectionId_date: { sectionId: sectionA.id, date: new Date('2026-08-10') } },
    create: {
      schoolId: school.id,
      branchId: mainBranch.id,
      academicYearId: year.id,
      sectionId: sectionA.id,
      date: new Date('2026-08-10'),
      title: 'Home diary 2026-08-10',
      lessonSummary: 'Mathematics: Students learned how to add fractions with like denominators.',
      homeworkNotes: 'Mathematics: Complete exercises 1-10 on adding fractions.',
      teacherRemarks: 'Please review the worksheet with your child.',
      createdById: teacherUserId,
    },
    update: {
      lessonSummary: 'Mathematics: Students learned how to add fractions with like denominators.',
    },
  });

  await prisma.idCard.upsert({
    where: { schoolId_cardNumber: { schoolId: school.id, cardNumber: 'STU-STU-001' } },
    create: {
      schoolId: school.id,
      branchId: mainBranch.id,
      holderType: 'STUDENT',
      studentId: ahmed.id,
      cardNumber: 'STU-STU-001',
      generatedById: schoolAdmin.id,
    },
    update: {},
  });

  await prisma.reportCard.upsert({
    where: {
      studentId_academicYearId_termLabel: {
        studentId: ahmed.id,
        academicYearId: year.id,
        termLabel: 'Term 1',
      },
    },
    create: {
      schoolId: school.id,
      branchId: mainBranch.id,
      academicYearId: year.id,
      studentId: ahmed.id,
      gradeId: grade5.id,
      sectionId: sectionA.id,
      termLabel: 'Term 1',
      overallPercentage: 100,
      attendanceRate: 100,
      remarks: 'Excellent work in mathematics.',
      generatedById: schoolAdmin.id,
      lines: {
        create: [{ subjectId: math.id, average: 100, quizzesTaken: 1, gradeLetter: 'A' }],
      },
    },
    update: { overallPercentage: 100, attendanceRate: 100 },
  });

  console.log({
    school: 'The Wisdom School',
    grades: 10,
    sections: 20,
    subjectsPerClass: 8,
    teachers: TEACHER_STAFF.length,
    students: studentRows.length,
    attendanceDays: ATTENDANCE_DAYS.length,
    admin: 'admin@abcschool.com / SchoolAdmin123!',
    principal: 'principal@abcschool.com / Principal123!',
    sampleTeacher: 'teacher@abcschool.com / Teacher123!  (Math, Grades 1-5)',
    scienceJunior: 'sana.iqbal@thewisdomschool.com / Teacher123!  (Science, Grades 1-5)',
    scienceSenior: 'ahmed.sheikh@thewisdomschool.com / Teacher123!  (Science, Grades 6-10)',
    quizId: quiz.id,
    publishedQuizId: publishedQuiz.id,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
