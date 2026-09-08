/**
 * Clone The Piercing Stars (TPS) → Demo The Piercing Stars (DTPS)
 *
 * Copies academics, teachers, students, parents, timetable, books, fees structure.
 * Skips attendance/lessons/quizzes/homework so you can test those fresh.
 * Skips billing invoices, AI usage, refresh tokens, audit logs.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/clone-tps-to-demo.ts
 *   npx ts-node --transpile-only scripts/clone-tps-to-demo.ts --force   # wipe existing DTPS first
 */
import { randomUUID } from 'crypto';
import {
  PrismaClient,
  RoleName,
  SubscriptionStatus,
  UserStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

const SRC_CODE = 'TPS';
const DST_CODE = 'DTPS';
const DST_NAME = 'Demo The Piercing Stars';
const FORCE = process.argv.includes('--force');

type IdMap = Map<string, string>;

function nid(): string {
  return randomUUID();
}

function mapGet(map: IdMap, oldId: string | null | undefined): string | null {
  if (!oldId) return null;
  const next = map.get(oldId);
  if (!next) throw new Error(`Missing ID map for ${oldId}`);
  return next;
}

function mapReq(map: IdMap, oldId: string): string {
  const next = mapGet(map, oldId);
  if (!next) throw new Error(`Missing required ID map for ${oldId}`);
  return next;
}

function rewriteUsername(username: string | null | undefined, src: string, dst: string): string | null {
  if (!username) return null;
  const s = src.toLowerCase();
  const d = dst.toLowerCase();
  if (username.toLowerCase().startsWith(`${s}.`)) {
    return `${d}.${username.slice(s.length + 1)}`;
  }
  return `${d}.${username}`;
}

function rewriteEmail(email: string, src: string, dst: string): string {
  const s = src.toLowerCase();
  const d = dst.toLowerCase();
  let out = email;
  out = out.replace(new RegExp(`@${s}\\.school$`, 'i'), `@${d}.school`);
  out = out.replace(new RegExp(`@${s}\\.parent\\.local$`, 'i'), `@${d}.parent.local`);
  out = out.replace(new RegExp(`^${s}\\.`, 'i'), `${d}.`);
  if (/@thepiercingstar\.com$/i.test(out) || out === email) {
    // Admin / non-tenant emails → demo domain
    if (!out.includes(`@${d}.`)) {
      const local = out.split('@')[0].replace(/[^a-zA-Z0-9._+-]/g, '') || 'admin';
      out = `${d}.${local}@${d}.school`;
    }
  }
  return out;
}

async function deleteDemoSchool(schoolId: string) {
  const users = await prisma.user.findMany({
    where: { schoolId },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length) {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.deviceToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { schoolId }] } });
    await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { schoolId: null } });
  }
  await prisma.school.delete({ where: { id: schoolId } });
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

async function chunkedCreateMany<T extends object>(
  label: string,
  rows: T[],
  createMany: (args: { data: T[]; skipDuplicates?: boolean }) => Promise<unknown>,
  size = 100,
) {
  for (let i = 0; i < rows.length; i += size) {
    const slice = rows.slice(i, i + size);
    await createMany({ data: slice });
    process.stdout.write(`\r  ${label}: ${Math.min(i + size, rows.length)}/${rows.length}`);
  }
  if (rows.length) process.stdout.write('\n');
}

async function main() {
  const src = await prisma.school.findUnique({
    where: { code: SRC_CODE },
    include: { settings: true, subscription: true },
  });
  if (!src) throw new Error(`Source school ${SRC_CODE} not found`);

  const existing = await prisma.school.findUnique({ where: { code: DST_CODE } });
  if (existing) {
    if (!FORCE) {
      throw new Error(
        `School ${DST_CODE} already exists (${existing.id}). Re-run with --force to replace it.`,
      );
    }
    console.log(`Removing existing ${DST_CODE}…`);
    await deleteDemoSchool(existing.id);
  }

  const roles = await prisma.role.findMany();
  const roleId = Object.fromEntries(roles.map((r) => [r.name, r.id])) as Record<RoleName, string>;

  const ids: Record<string, IdMap> = {
    branch: new Map(),
    user: new Map(),
    teacher: new Map(),
    parent: new Map(),
    year: new Map(),
    term: new Map(),
    stage: new Map(),
    grade: new Map(),
    section: new Map(),
    subject: new Map(),
    fee: new Map(),
    curriculum: new Map(),
    template: new Map(),
    student: new Map(),
  };

  console.log(`Cloning ${src.name} (${SRC_CODE}) → ${DST_NAME} (${DST_CODE})…`);

  const newSchoolId = nid();
  await prisma.school.create({
    data: {
      id: newSchoolId,
      name: DST_NAME,
      code: DST_CODE,
      email: `admin@${DST_CODE.toLowerCase()}.school`,
      phone: src.phone,
      address: src.address,
      city: src.city,
      country: src.country,
      logo: src.logo,
      status: src.status,
      pricingPlanId: src.pricingPlanId,
    },
  });

  const branches = await prisma.branch.findMany({ where: { schoolId: src.id } });
  for (const b of branches) {
    const id = nid();
    ids.branch.set(b.id, id);
    await prisma.branch.create({
      data: {
        id,
        schoolId: newSchoolId,
        name: b.name,
        code: b.code,
        address: b.address,
        phone: b.phone,
        status: b.status,
      },
    });
  }

  if (src.settings) {
    await prisma.schoolSettings.create({
      data: {
        id: nid(),
        schoolId: newSchoolId,
        timezone: src.settings.timezone,
        locale: src.settings.locale,
        maxQuizReminders: src.settings.maxQuizReminders,
        academicYearStartMonth: src.settings.academicYearStartMonth,
        setupCompleted: true,
        examPattern: src.settings.examPattern,
        metadata: src.settings.metadata ?? undefined,
      },
    });
  }

  const pricingPlanId =
    src.subscription?.pricingPlanId ?? src.pricingPlanId ?? undefined;
  if (!pricingPlanId) {
    throw new Error('Source school has no pricing plan; cannot create demo subscription');
  }
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + 90);
  await prisma.schoolSubscription.create({
    data: {
      id: nid(),
      schoolId: newSchoolId,
      pricingPlanId,
      status: SubscriptionStatus.TRIAL,
      startsAt: new Date(),
      trialEndsAt: trialEnds,
    },
  });

  // ---- Users (admin + teachers + parents) ----
  const srcUsers = await prisma.user.findMany({
    where: { schoolId: src.id },
    include: {
      roles: true,
      teacherProfile: true,
      parentProfile: true,
    },
  });

  console.log(`  Users: ${srcUsers.length}`);
  for (const u of srcUsers) {
    const id = nid();
    ids.user.set(u.id, id);
    const username = rewriteUsername(u.username, SRC_CODE, DST_CODE);
    let email = rewriteEmail(u.email, SRC_CODE, DST_CODE);
    // Guarantee uniqueness if rewrite collided oddly
    if (email === u.email) {
      email = `${DST_CODE.toLowerCase()}.${u.email.replace('@', '.at.')}`;
    }
    await prisma.user.create({
      data: {
        id,
        email,
        username,
        passwordHash: u.passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        status: UserStatus.ACTIVE,
        schoolId: newSchoolId,
        mustChangePassword: u.mustChangePassword,
        permissions: u.permissions ?? undefined,
      },
    });
    for (const ur of u.roles) {
      await prisma.userRole.create({
        data: {
          id: nid(),
          userId: id,
          roleId: ur.roleId,
          schoolId: newSchoolId,
        },
      });
    }
    if (u.teacherProfile) {
      const tid = nid();
      ids.teacher.set(u.teacherProfile.id, tid);
      await prisma.teacherProfile.create({
        data: {
          id: tid,
          userId: id,
          schoolId: newSchoolId,
          branchId: mapReq(ids.branch, u.teacherProfile.branchId),
          employeeCode: u.teacherProfile.employeeCode,
          hireDate: u.teacherProfile.hireDate,
          status: u.teacherProfile.status,
        },
      });
    }
    if (u.parentProfile) {
      const pid = nid();
      ids.parent.set(u.parentProfile.id, pid);
      await prisma.parentProfile.create({
        data: {
          id: pid,
          userId: id,
          schoolId: newSchoolId,
          phone: u.parentProfile.phone,
          relationshipNotes: u.parentProfile.relationshipNotes,
        },
      });
    }
  }

  // ---- Academic years / terms ----
  const years = await prisma.academicYear.findMany({
    where: { schoolId: src.id },
    include: { terms: true },
  });
  for (const y of years) {
    const id = nid();
    ids.year.set(y.id, id);
    await prisma.academicYear.create({
      data: {
        id,
        schoolId: newSchoolId,
        branchId: y.branchId ? mapReq(ids.branch, y.branchId) : null,
        name: y.name,
        startDate: y.startDate,
        endDate: y.endDate,
        isCurrent: y.isCurrent,
      },
    });
    for (const t of y.terms) {
      const tid = nid();
      ids.term.set(t.id, tid);
      await prisma.term.create({
        data: {
          id: tid,
          academicYearId: id,
          name: t.name,
          startDate: t.startDate,
          endDate: t.endDate,
        },
      });
    }
  }

  // ---- Stages / grades / sections ----
  const stages = await prisma.schoolStage.findMany({ where: { schoolId: src.id } });
  for (const st of stages) {
    const id = nid();
    ids.stage.set(st.id, id);
    await prisma.schoolStage.create({
      data: {
        id,
        schoolId: newSchoolId,
        name: st.name,
        sortOrder: st.sortOrder,
        coordinatorId: st.coordinatorId ? mapGet(ids.teacher, st.coordinatorId) : null,
      },
    });
  }

  const grades = await prisma.grade.findMany({ where: { schoolId: src.id } });
  for (const g of grades) {
    const id = nid();
    ids.grade.set(g.id, id);
    await prisma.grade.create({
      data: {
        id,
        schoolId: newSchoolId,
        stageId: g.stageId ? mapGet(ids.stage, g.stageId) : null,
        name: g.name,
        level: g.level,
        admissionFee: g.admissionFee,
        tuitionFee: g.tuitionFee,
        hasPeriodTimetable: g.hasPeriodTimetable,
      },
    });
  }

  const sections = await prisma.section.findMany({ where: { schoolId: src.id } });
  for (const s of sections) {
    const id = nid();
    ids.section.set(s.id, id);
    await prisma.section.create({
      data: {
        id,
        schoolId: newSchoolId,
        branchId: mapReq(ids.branch, s.branchId),
        gradeId: mapReq(ids.grade, s.gradeId),
        name: s.name,
        capacity: s.capacity,
        classTeacherId: s.classTeacherId ? mapGet(ids.teacher, s.classTeacherId) : null,
      },
    });
  }

  // ---- Subjects ----
  const subjects = await prisma.subject.findMany({ where: { schoolId: src.id } });
  console.log(`  Subjects: ${subjects.length}`);
  await chunkedCreateMany(
    'subjects',
    subjects.map((s) => {
      const id = nid();
      ids.subject.set(s.id, id);
      return {
        id,
        schoolId: newSchoolId,
        gradeId: s.gradeId ? mapGet(ids.grade, s.gradeId) : null,
        name: s.name,
        code: s.code,
      };
    }),
    (args) => prisma.subject.createMany(args),
  );

  const classSubjects = await prisma.classSubject.findMany({
    where: { section: { schoolId: src.id } },
  });
  console.log(`  Class subjects: ${classSubjects.length}`);
  await chunkedCreateMany(
    'classSubjects',
    classSubjects.map((c) => ({
      id: nid(),
      sectionId: mapReq(ids.section, c.sectionId),
      subjectId: mapReq(ids.subject, c.subjectId),
      teacherId: c.teacherId ? mapGet(ids.teacher, c.teacherId) : null,
      assistantTeacherId: c.assistantTeacherId
        ? mapGet(ids.teacher, c.assistantTeacherId)
        : null,
      academicYearId: mapReq(ids.year, c.academicYearId),
      branchId: mapReq(ids.branch, c.branchId),
    })),
    (args) => prisma.classSubject.createMany(args),
  );

  const teacherSubjects = await prisma.teacherSubject.findMany({
    where: { teacher: { schoolId: src.id } },
  });
  await chunkedCreateMany(
    'teacherSubjects',
    teacherSubjects.map((t) => ({
      id: nid(),
      teacherId: mapReq(ids.teacher, t.teacherId),
      subjectId: mapReq(ids.subject, t.subjectId),
      branchId: mapReq(ids.branch, t.branchId),
      academicYearId: mapReq(ids.year, t.academicYearId),
    })),
    (args) => prisma.teacherSubject.createMany(args),
  );

  const examConfigs = await prisma.examConfig.findMany({ where: { schoolId: src.id } });
  await chunkedCreateMany(
    'examConfigs',
    examConfigs.map((e) => ({
      id: nid(),
      schoolId: newSchoolId,
      academicYearId: mapReq(ids.year, e.academicYearId),
      name: e.name,
      maxMarks: e.maxMarks,
      sequence: e.sequence,
      startDate: e.startDate,
      endDate: e.endDate,
    })),
    (args) => prisma.examConfig.createMany(args),
  );

  const quizTargets = await prisma.quizTarget.findMany({ where: { schoolId: src.id } });
  await chunkedCreateMany(
    'quizTargets',
    quizTargets.map((q) => ({
      id: nid(),
      schoolId: newSchoolId,
      gradeId: mapReq(ids.grade, q.gradeId),
      subjectId: mapReq(ids.subject, q.subjectId),
      minQuizzes: q.minQuizzes,
    })),
    (args) => prisma.quizTarget.createMany(args),
  );

  // ---- Fees ----
  const feeStructures = await prisma.feeStructure.findMany({ where: { schoolId: src.id } });
  for (const f of feeStructures) {
    const id = nid();
    ids.fee.set(f.id, id);
    await prisma.feeStructure.create({
      data: {
        id,
        schoolId: newSchoolId,
        gradeId: f.gradeId ? mapGet(ids.grade, f.gradeId) : null,
        kind: f.kind,
        name: f.name,
        amount: f.amount,
        currency: f.currency,
        frequency: f.frequency,
        active: f.active,
        description: f.description,
      },
    });
  }

  // ---- Curriculum / books ----
  const curricula = await prisma.curriculum.findMany({
    where: { schoolId: src.id },
    include: { chapters: { include: { topics: { include: { concepts: true } } } } },
  });
  console.log(`  Curricula: ${curricula.length}`);
  for (const c of curricula) {
    const id = nid();
    ids.curriculum.set(c.id, id);
    await prisma.curriculum.create({
      data: {
        id,
        schoolId: newSchoolId,
        subjectId: mapReq(ids.subject, c.subjectId),
        gradeId: mapReq(ids.grade, c.gradeId),
        name: c.name,
        publisher: c.publisher,
      },
    });
    for (const ch of c.chapters) {
      const chId = nid();
      await prisma.chapter.create({
        data: {
          id: chId,
          curriculumId: id,
          name: ch.name,
          order: ch.order,
          pageFrom: ch.pageFrom,
          pageTo: ch.pageTo,
        },
      });
      for (const topic of ch.topics) {
        const topicId = nid();
        await prisma.topic.create({
          data: {
            id: topicId,
            chapterId: chId,
            name: topic.name,
            order: topic.order,
          },
        });
        if (topic.concepts.length) {
          await prisma.concept.createMany({
            data: topic.concepts.map((co) => ({
              id: nid(),
              topicId,
              name: co.name,
            })),
          });
        }
      }
    }
  }

  // ---- Report card templates ----
  const templates = await prisma.reportCardTemplate.findMany({
    where: { schoolId: src.id },
    include: { lines: true },
  });
  for (const t of templates) {
    const id = nid();
    ids.template.set(t.id, id);
    await prisma.reportCardTemplate.create({
      data: {
        id,
        schoolId: newSchoolId,
        code: t.code,
        examTitle: t.examTitle,
        classLabel: t.classLabel,
        totalMarks: t.totalMarks,
        showRank: t.showRank,
        showStream: t.showStream,
        showFatherName: t.showFatherName,
        showDate: t.showDate,
        showGradingKey: t.showGradingKey,
        showMonthYear: t.showMonthYear,
      },
    });
    if (t.lines.length) {
      await prisma.reportCardTemplateLine.createMany({
        data: t.lines.map((l) => ({
          id: nid(),
          templateId: id,
          sortOrder: l.sortOrder,
          label: l.label,
          maxMarks: l.maxMarks,
          matchSubject: l.matchSubject,
          choiceGroup: l.choiceGroup,
          includeInTotal: l.includeInTotal,
        })),
      });
    }
  }

  const styles = await prisma.teacherGradeStyle.findMany({ where: { schoolId: src.id } });
  await chunkedCreateMany(
    'teacherGradeStyles',
    styles.map((s) => ({
      id: nid(),
      teacherId: mapReq(ids.teacher, s.teacherId),
      gradeId: mapReq(ids.grade, s.gradeId),
      schoolId: newSchoolId,
      keyPointStyle: s.keyPointStyle,
      homeworkStyle: s.homeworkStyle,
      diaryStyle: s.diaryStyle,
    })),
    (args) => prisma.teacherGradeStyle.createMany(args),
  );

  // ---- Timetable ----
  const slots = await prisma.timetableSlot.findMany({ where: { schoolId: src.id } });
  console.log(`  Timetable slots: ${slots.length}`);
  await chunkedCreateMany(
    'timetableSlots',
    slots.map((sl) => ({
      id: nid(),
      schoolId: newSchoolId,
      academicYearId: mapReq(ids.year, sl.academicYearId),
      sectionId: mapReq(ids.section, sl.sectionId),
      weekday: sl.weekday,
      periodNumber: sl.periodNumber,
      startTime: sl.startTime,
      endTime: sl.endTime,
      title: sl.title,
      subjectId: sl.subjectId ? mapGet(ids.subject, sl.subjectId) : null,
      teacherId: sl.teacherId ? mapGet(ids.teacher, sl.teacherId) : null,
    })),
    (args) => prisma.timetableSlot.createMany(args),
  );

  // ---- Students / enrollments / parents links ----
  const students = await prisma.student.findMany({ where: { schoolId: src.id } });
  console.log(`  Students: ${students.length}`);
  await chunkedCreateMany(
    'students',
    students.map((st) => {
      const id = nid();
      ids.student.set(st.id, id);
      return {
        id,
        schoolId: newSchoolId,
        branchId: mapReq(ids.branch, st.branchId),
        studentCode: st.studentCode,
        admissionNumber: st.admissionNumber,
        firstName: st.firstName,
        lastName: st.lastName,
        dateOfBirth: st.dateOfBirth,
        gender: st.gender,
        status: st.status,
        photoUrl: st.photoUrl,
        address: st.address,
        scienceGroup: st.scienceGroup,
      };
    }),
    (args) => prisma.student.createMany(args),
  );

  const enrollments = await prisma.studentEnrollment.findMany({
    where: { student: { schoolId: src.id } },
  });
  await chunkedCreateMany(
    'enrollments',
    enrollments.map((e) => ({
      id: nid(),
      studentId: mapReq(ids.student, e.studentId),
      academicYearId: mapReq(ids.year, e.academicYearId),
      gradeId: mapReq(ids.grade, e.gradeId),
      sectionId: mapReq(ids.section, e.sectionId),
      enrollmentDate: e.enrollmentDate,
      withdrawalDate: e.withdrawalDate,
      status: e.status,
    })),
    (args) => prisma.studentEnrollment.createMany(args),
  );

  const links = await prisma.studentParent.findMany({
    where: { student: { schoolId: src.id } },
  });
  await chunkedCreateMany(
    'studentParents',
    links.map((l) => ({
      id: nid(),
      studentId: mapReq(ids.student, l.studentId),
      parentId: mapReq(ids.parent, l.parentId),
      relationship: l.relationship,
      isPrimary: l.isPrimary,
    })),
    (args) => prisma.studentParent.createMany(args),
  );

  // Student fees as unpaid copies (skip payment history)
  const studentFees = await prisma.studentFee.findMany({ where: { schoolId: src.id } });
  await chunkedCreateMany(
    'studentFees',
    studentFees.map((f) => ({
      id: nid(),
      schoolId: newSchoolId,
      branchId: mapReq(ids.branch, f.branchId),
      studentId: mapReq(ids.student, f.studentId),
      feeStructureId: mapReq(ids.fee, f.feeStructureId),
      academicYearId: mapReq(ids.year, f.academicYearId),
      sectionId: f.sectionId ? mapGet(ids.section, f.sectionId) : null,
      periodLabel: f.periodLabel,
      amount: f.amount,
      paidAmount: 0,
      discountAmount: 0,
      dueDate: f.dueDate,
      status: 'DUE' as const,
    })),
    (args) => prisma.studentFee.createMany(args),
  );

  const admin = await prisma.user.findFirst({
    where: { schoolId: newSchoolId, roles: { some: { role: { name: RoleName.SCHOOL_ADMIN } } } },
    select: { id: true, email: true, username: true },
  });
  if (admin) {
    const bcrypt = await import('bcryptjs');
    await prisma.user.update({
      where: { id: admin.id },
      data: {
        passwordHash: await bcrypt.hash('DemoAdmin123!', 12),
        mustChangePassword: false,
      },
    });
  }
  const sampleTeacher = await prisma.user.findFirst({
    where: { schoolId: newSchoolId, teacherProfile: { isNot: null } },
    select: { email: true, username: true, firstName: true },
  });
  const sampleParent = await prisma.user.findFirst({
    where: { schoolId: newSchoolId, parentProfile: { isNot: null } },
    select: { email: true, username: true },
  });

  const summary = {
    schoolId: newSchoolId,
    code: DST_CODE,
    name: DST_NAME,
    counts: {
      students: await prisma.student.count({ where: { schoolId: newSchoolId } }),
      teachers: await prisma.teacherProfile.count({ where: { schoolId: newSchoolId } }),
      parents: await prisma.parentProfile.count({ where: { schoolId: newSchoolId } }),
      subjects: await prisma.subject.count({ where: { schoolId: newSchoolId } }),
      slots: await prisma.timetableSlot.count({ where: { schoolId: newSchoolId } }),
      enrollments: await prisma.studentEnrollment.count({
        where: { student: { schoolId: newSchoolId } },
      }),
    },
    logins: {
      admin: admin
        ? { email: admin.email, username: admin.username, password: 'DemoAdmin123!' }
        : null,
      sampleTeacher,
      sampleParent,
      note:
        'Teachers keep TPS passwords (Name+last4phone!). Parents keep Password123. Usernames use dtps. prefix.',
    },
  };
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
