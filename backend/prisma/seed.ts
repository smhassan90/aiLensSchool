import {
  AnnouncementAudience,
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
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

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
      name: 'ABC School',
      code: 'ABC',
      email: 'info@abcschool.com',
      phone: '+92-300-0000000',
      city: 'Karachi',
      country: 'Pakistan',
      status: SchoolStatus.ACTIVE,
      pricingPlanId: plan.id,
    },
    update: {
      name: 'ABC School',
      status: SchoolStatus.ACTIVE,
      pricingPlanId: plan.id,
    },
  });

  await prisma.schoolSettings.upsert({
    where: { schoolId: school.id },
    create: { schoolId: school.id },
    update: {},
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
      address: 'Clifton, Karachi',
    },
    update: { name: 'Main Campus' },
  });

  const northBranch = await prisma.branch.upsert({
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
      update: { passwordHash: adminHash, schoolId: school.id, status: UserStatus.ACTIVE, username: 'schooladmin' },
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

  const teacherHash = await bcrypt.hash('Teacher123!', 12);
  const teacherUser = await prisma.user.upsert({
    where: { email: 'teacher@abcschool.com' },
    create: {
      email: 'teacher@abcschool.com',
      username: 'teacher',
      passwordHash: teacherHash,
      firstName: 'Fatima',
      lastName: 'Khan',
      schoolId: school.id,
      status: UserStatus.ACTIVE,
    },
      update: { passwordHash: teacherHash, schoolId: school.id, username: 'teacher' },
  });
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.TEACHER } });
  const existingTeacherRole = await prisma.userRole.findFirst({
    where: { userId: teacherUser.id, roleId: teacherRole.id, schoolId: school.id },
  });
  if (!existingTeacherRole) {
    await prisma.userRole.create({
      data: { userId: teacherUser.id, roleId: teacherRole.id, schoolId: school.id },
    });
  }

  const teacherProfile = await prisma.teacherProfile.upsert({
    where: { userId: teacherUser.id },
    create: {
      userId: teacherUser.id,
      schoolId: school.id,
      branchId: mainBranch.id,
      employeeCode: 'T-001',
      status: TeacherStatus.ACTIVE,
      hireDate: new Date('2024-01-01'),
    },
    update: { branchId: mainBranch.id, status: TeacherStatus.ACTIVE },
  });

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
    update: { isCurrent: true },
  });

  const grade1 = await prisma.grade.upsert({
    where: { schoolId_name: { schoolId: school.id, name: 'Grade 1' } },
    create: { schoolId: school.id, name: 'Grade 1', level: 1 },
    update: { level: 1 },
  });
  const grade2 = await prisma.grade.upsert({
    where: { schoolId_name: { schoolId: school.id, name: 'Grade 2' } },
    create: { schoolId: school.id, name: 'Grade 2', level: 2 },
    update: { level: 2 },
  });
  const grade5 = await prisma.grade.upsert({
    where: { schoolId_name: { schoolId: school.id, name: 'Grade 5' } },
    create: { schoolId: school.id, name: 'Grade 5', level: 5 },
    update: { level: 5 },
  });

  const section1A = await prisma.section.upsert({
    where: {
      branchId_gradeId_name: {
        branchId: mainBranch.id,
        gradeId: grade1.id,
        name: 'A',
      },
    },
    create: {
      schoolId: school.id,
      branchId: mainBranch.id,
      gradeId: grade1.id,
      name: 'A',
      capacity: 30,
    },
    update: {},
  });
  const section2B = await prisma.section.upsert({
    where: {
      branchId_gradeId_name: {
        branchId: mainBranch.id,
        gradeId: grade2.id,
        name: 'B',
      },
    },
    create: {
      schoolId: school.id,
      branchId: mainBranch.id,
      gradeId: grade2.id,
      name: 'B',
      capacity: 30,
    },
    update: {},
  });
  const sectionA = await prisma.section.upsert({
    where: {
      branchId_gradeId_name: {
        branchId: mainBranch.id,
        gradeId: grade5.id,
        name: 'A',
      },
    },
    create: {
      schoolId: school.id,
      branchId: mainBranch.id,
      gradeId: grade5.id,
      name: 'A',
      capacity: 40,
    },
    update: {},
  });

  const math = await prisma.subject.upsert({
    where: { schoolId_code: { schoolId: school.id, code: 'MATH5' } },
    create: {
      schoolId: school.id,
      gradeId: grade5.id,
      name: 'Mathematics',
      code: 'MATH5',
    },
    update: { name: 'Mathematics' },
  });

  const science = await prisma.subject.upsert({
    where: { schoolId_code: { schoolId: school.id, code: 'SCI5' } },
    create: {
      schoolId: school.id,
      gradeId: grade5.id,
      name: 'Science',
      code: 'SCI5',
    },
    update: { name: 'Science' },
  });

  await prisma.classSubject.upsert({
    where: {
      sectionId_subjectId_academicYearId: {
        sectionId: sectionA.id,
        subjectId: math.id,
        academicYearId: year.id,
      },
    },
    create: {
      sectionId: sectionA.id,
      subjectId: math.id,
      academicYearId: year.id,
      branchId: mainBranch.id,
      teacherId: teacherProfile.id,
    },
    update: { teacherId: teacherProfile.id },
  });

  await prisma.teacherSubject.upsert({
    where: {
      teacherId_subjectId_branchId_academicYearId: {
        teacherId: teacherProfile.id,
        subjectId: math.id,
        branchId: mainBranch.id,
        academicYearId: year.id,
      },
    },
    create: {
      teacherId: teacherProfile.id,
      subjectId: math.id,
      branchId: mainBranch.id,
      academicYearId: year.id,
    },
    update: {},
  });

  const parentRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.PARENT } });
  const parentHash = await bcrypt.hash('Parent123!', 12);

  async function ensureParent(
    email: string,
    firstName: string,
    lastName: string,
    username: string,
  ) {
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        username,
        passwordHash: parentHash,
        firstName,
        lastName,
        schoolId: school.id,
        status: UserStatus.ACTIVE,
        mustChangePassword: false,
      },
      update: { passwordHash: parentHash, schoolId: school.id, username, mustChangePassword: false },
    });
    const roleLink = await prisma.userRole.findFirst({
      where: { userId: user.id, roleId: parentRole.id, schoolId: school.id },
    });
    if (!roleLink) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: parentRole.id, schoolId: school.id },
      });
    }
    const profile = await prisma.parentProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, schoolId: school.id, phone: '+92-300-1111111' },
      update: { schoolId: school.id },
    });
    return profile;
  }

  const parentOne = await ensureParent('parent1@example.com', 'Imran', 'Ahmed', 'abc.f.stu001');
  const parentTwo = await ensureParent('parent2@example.com', 'Sana', 'Ali', 'abc.m.stu001');

  async function ensureStudent(
    code: string,
    admission: string,
    firstName: string,
    lastName: string,
    gender: Gender,
    parentId: string,
    gradeId: string,
    sectionId: string,
  ) {
    const existing = await prisma.student.findUnique({
      where: { schoolId_studentCode: { schoolId: school.id, studentCode: code } },
    });
    const student =
      existing ??
      (await prisma.student.create({
        data: {
          schoolId: school.id,
          branchId: mainBranch.id,
          studentCode: code,
          admissionNumber: admission,
          firstName,
          lastName,
          gender,
          status: StudentStatus.ACTIVE,
          dateOfBirth: new Date('2015-05-01'),
        },
      }));

    const enrollment = await prisma.studentEnrollment.findFirst({
      where: {
        studentId: student.id,
        academicYearId: year.id,
        status: EnrollmentStatus.ACTIVE,
      },
    });
    if (!enrollment) {
      await prisma.studentEnrollment.create({
        data: {
          studentId: student.id,
          academicYearId: year.id,
          gradeId,
          sectionId,
          enrollmentDate: new Date('2025-08-15'),
          status: EnrollmentStatus.ACTIVE,
        },
      });
    }

    await prisma.studentParent.upsert({
      where: { studentId_parentId: { studentId: student.id, parentId } },
      create: {
        studentId: student.id,
        parentId,
        relationship: ParentRelationship.FATHER,
        isPrimary: true,
      },
      update: {},
    });

    return student;
  }

  const ahmed = await ensureStudent(
    'STU-001',
    'ADM-001',
    'Ahmed',
    'Imran',
    Gender.MALE,
    parentOne.id,
    grade5.id,
    sectionA.id,
  );
  const ayesha = await ensureStudent(
    'STU-002',
    'ADM-002',
    'Ayesha',
    'Ali',
    Gender.FEMALE,
    parentOne.id,
    grade2.id,
    section2B.id,
  );
  const ali = await ensureStudent(
    'STU-003',
    'ADM-003',
    'Ali',
    'Hassan',
    Gender.MALE,
    parentOne.id,
    grade1.id,
    section1A.id,
  );

  await prisma.studentParent.upsert({
    where: { studentId_parentId: { studentId: ahmed.id, parentId: parentTwo.id } },
    create: {
      studentId: ahmed.id,
      parentId: parentTwo.id,
      relationship: ParentRelationship.MOTHER,
      isPrimary: false,
    },
    update: {},
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
      teacherId: teacherProfile.id,
      createdById: teacherUser.id,
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
      createdById: teacherUser.id,
      title: 'Fractions practice worksheet',
      description: 'Complete exercises 1-10 on adding fractions.',
      dueDate: new Date('2026-08-14'),
      publishedAt: new Date('2026-08-10'),
    },
    update: {
      title: 'Fractions practice worksheet',
    },
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
      createdById: teacherUser.id,
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
    update: {
      status: QuizStatus.DRAFT,
      title: 'Fractions Quiz (Draft)',
    },
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
      createdById: teacherUser.id,
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
      assignments: {
        create: [{ sectionId: sectionA.id }],
      },
    },
    update: {
      status: QuizStatus.PUBLISHED,
      publishedAt: new Date('2026-08-11'),
    },
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

  const attendanceDays = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'];
  const roster = [
    { student: ahmed, sectionId: sectionA.id, pattern: [AttendanceStatus.PRESENT, AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.PRESENT] },
    { student: ayesha, sectionId: section2B.id, pattern: [AttendanceStatus.PRESENT, AttendanceStatus.ABSENT, AttendanceStatus.PRESENT, AttendanceStatus.PRESENT] },
    { student: ali, sectionId: section1A.id, pattern: [AttendanceStatus.PRESENT, AttendanceStatus.PRESENT, AttendanceStatus.PRESENT, AttendanceStatus.EXCUSED] },
  ];
  for (const row of roster) {
    for (let i = 0; i < attendanceDays.length; i++) {
      await prisma.attendance.upsert({
        where: { studentId_date: { studentId: row.student.id, date: new Date(attendanceDays[i]) } },
        create: {
          schoolId: school.id,
          branchId: mainBranch.id,
          academicYearId: year.id,
          sectionId: row.sectionId,
          studentId: row.student.id,
          date: new Date(attendanceDays[i]),
          status: row.pattern[i],
        },
        update: { status: row.pattern[i] },
      });
    }
  }

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
  await prisma.studentFee.upsert({
    where: {
      studentId_feeStructureId_periodLabel: {
        studentId: ayesha.id,
        feeStructureId: tuition.id,
        periodLabel: 'August 2026',
      },
    },
    create: {
      schoolId: school.id,
      branchId: mainBranch.id,
      studentId: ayesha.id,
      feeStructureId: tuition.id,
      academicYearId: year.id,
      sectionId: section2B.id,
      periodLabel: 'August 2026',
      amount: 5000,
      paidAmount: 5000,
      dueDate: new Date('2026-08-10'),
      status: StudentFeeStatus.PAID,
    },
    update: { status: StudentFeeStatus.PAID, paidAmount: 5000 },
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
      createdById: teacherUser.id,
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
    superAdmin: superAdmin.email,
    school: school.code,
    branches: [mainBranch.code, northBranch.code],
    schoolAdmin: schoolAdmin.email,
    teacher: teacherUser.email,
    students: [ahmed.firstName, ayesha.firstName, ali.firstName],
    parents: ['abc.f.stu001 / Parent123!', 'abc.m.stu001 / Parent123!'],
    subjects: [math.code, science.code],
    lessonId: lesson.id,
    quizId: quiz.id,
    publishedQuizId: publishedQuiz.id,
    plan: { rate: 100, min: 5000 },
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
