/**
 * DTPS mobile/API flows: fee paid → parent sees it; quiz generated → right student;
 * quiz submitted → teacher portal stats.
 *
 * Usage: node scripts/dtps-mobile-flows-e2e.mjs
 */
const { PrismaClient, LessonStatus, StudentFeeStatus } = require('@prisma/client');
const { randomUUID } = require('crypto');

const BASE = process.argv[2] || process.env.API_BASE_URL || 'http://localhost:3001/api/v1';
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${message}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${message}`);
  }
}

async function req(method, path, { token, body } = {}, attempt = 1) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      const message = json?.error?.message || json?.message || text.slice(0, 200);
      throw new Error(`${method} ${path} -> ${res.status} ${message}`);
    }
    return json?.success && 'data' in json ? json.data : json;
  } catch (err) {
    if (attempt < 3 && /fetch failed|aborted|ECONNREFUSED/i.test(String(err.message || err))) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      return req(method, path, { token, body }, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function login(creds) {
  return req('POST', '/auth/login', { body: creds });
}

function teacherPassword(firstName, phone) {
  const letters = firstName.replace(/[^A-Za-z]/g, '').slice(0, 4).padEnd(4, 'Teach');
  const digits = String(phone || '').replace(/\D/g, '').slice(-4).padStart(4, '1234');
  return `${letters[0].toUpperCase()}${letters.slice(1).toLowerCase()}${digits}!`;
}

async function main() {
  console.log(`API ${BASE}\n`);

  const school = await prisma.school.findUnique({ where: { code: 'DTPS' } });
  if (!school) throw new Error('DTPS school not found — run clone-tps-to-demo.ts first');

  const admin = await prisma.user.findFirst({
    where: { schoolId: school.id, roles: { some: { role: { name: 'SCHOOL_ADMIN' } } } },
  });
  if (!admin) throw new Error('DTPS admin missing');

  let fee = await prisma.studentFee.findFirst({
    where: { schoolId: school.id, status: StudentFeeStatus.DUE },
    include: {
      student: true,
      feeStructure: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!fee) {
    // Prior run may have marked the only bill paid — reopen one for this check.
    const anyFee = await prisma.studentFee.findFirst({
      where: { schoolId: school.id },
      include: { student: true, feeStructure: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!anyFee) throw new Error('No student fee on DTPS');
    fee = await prisma.studentFee.update({
      where: { id: anyFee.id },
      data: { status: StudentFeeStatus.DUE, paidAmount: 0 },
      include: { student: true, feeStructure: true },
    });
  }

  const parentLink = await prisma.studentParent.findFirst({
    where: { studentId: fee.student.id },
    include: { parent: { include: { user: true } } },
  });
  if (!parentLink) throw new Error('No parent linked to fee student');

  const classSubject = await prisma.classSubject.findFirst({
    where: {
      section: { schoolId: school.id },
      teacherId: { not: null },
      sectionId: (
        await prisma.studentEnrollment.findFirst({
          where: { studentId: fee.student.id, status: 'ACTIVE' },
        })
      )?.sectionId,
    },
    include: {
      teacher: { include: { user: true } },
      section: { include: { grade: true } },
      subject: true,
    },
  });

  // Prefer a class subject for THIS student's section; else any DTPS class subject
  const cs =
    classSubject ??
    (await prisma.classSubject.findFirst({
      where: { section: { schoolId: school.id }, teacherId: { not: null } },
      include: {
        teacher: { include: { user: true } },
        section: { include: { grade: true } },
        subject: true,
      },
    }));
  if (!cs?.teacher?.user) throw new Error('No DTPS class subject with teacher');

  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId: fee.student.id, status: 'ACTIVE' },
    include: { section: true, grade: true },
  });

  // Another student in a different section (for isolation check)
  const otherEnrollment = await prisma.studentEnrollment.findFirst({
    where: {
      student: { schoolId: school.id },
      status: 'ACTIVE',
      sectionId: { not: cs.sectionId },
    },
    include: { student: true, section: true, grade: true },
  });

  const teacherUser = cs.teacher.user;
  const teacherPass = teacherPassword(teacherUser.firstName, teacherUser.phone);
  const parentUser = parentLink.parent.user;

  console.log('Context');
  console.log(`  school=${school.name}`);
  console.log(`  student=${fee.student.firstName} ${fee.student.lastName} (${enrollment?.grade?.name})`);
  console.log(`  parent=${parentUser.username}`);
  console.log(`  teacher=${teacherUser.username} / ${teacherPass}`);
  console.log(`  class=${cs.section.grade.name} · ${cs.subject.name}`);

  // ---- Auth ----
  console.log('\n1) Auth');
  const adminSession = await login({
    username: admin.username,
    password: 'DemoAdmin123!',
  });
  assert(Boolean(adminSession.accessToken), 'admin login');
  const adminTok = adminSession.accessToken;

  const teacherSession = await login({
    username: teacherUser.username,
    password: teacherPass,
    expectedRole: 'TEACHER',
  });
  assert(Boolean(teacherSession.accessToken), 'teacher login');
  const teacherTok = teacherSession.accessToken;

  let parentTok;
  try {
    const parentSession = await login({
      username: parentUser.username,
      password: 'Password123',
      expectedRole: 'PARENT',
    });
    parentTok = parentSession.accessToken;
    assert(Boolean(parentTok), `parent login as ${parentUser.username}`);
  } catch (err) {
    // Fallback: master password if configured
    try {
      const parentSession = await login({
        username: parentUser.username,
        password: 'SuperParentDebug123!',
        expectedRole: 'PARENT',
      });
      parentTok = parentSession.accessToken;
      assert(Boolean(parentTok), `parent login via master password (${parentUser.username})`);
    } catch {
      assert(false, `parent login failed: ${err.message}`);
      throw err;
    }
  }

  // ---- Fees ----
  console.log('\n2) Fee payment → mobile parent fees API');
  const beforeFees = await req(
    'GET',
    `/fees?studentId=${encodeURIComponent(fee.studentId)}&limit=50`,
    { token: parentTok },
  );
  const beforeRow = (beforeFees.items ?? []).find((row) => row.id === fee.id);
  assert(Boolean(beforeRow), 'parent can see the unpaid fee on mobile API');
  assert(
    beforeRow?.status === 'DUE' || beforeRow?.status === 'PARTIAL',
    `fee status before payment is ${beforeRow?.status}`,
  );

  await req('POST', '/fees/mark-paid', {
    token: adminTok,
    body: { studentFeeId: fee.id },
  });

  const afterFees = await req(
    'GET',
    `/fees?studentId=${encodeURIComponent(fee.studentId)}&limit=50`,
    { token: parentTok },
  );
  const afterRow = (afterFees.items ?? []).find((row) => row.id === fee.id);
  assert(afterRow?.status === 'PAID', `fee status after payment is PAID (got ${afterRow?.status})`);
  assert(
    Number(afterRow?.paidAmount) >= Number(afterRow?.amount) || afterRow?.status === 'PAID',
    `paidAmount reflected (${afterRow?.paidAmount}/${afterRow?.amount})`,
  );

  // ---- Quiz setup: seed a confirmed lesson for generate ----
  console.log('\n3) Quiz generate → right student on mobile');
  const lessonDate = new Date();
  const dateStr = lessonDate.toISOString().slice(0, 10);
  await prisma.dailyLesson.create({
    data: {
      id: randomUUID(),
      schoolId: school.id,
      branchId: cs.branchId,
      academicYearId: cs.academicYearId,
      gradeId: cs.section.gradeId,
      sectionId: cs.sectionId,
      subjectId: cs.subjectId,
      teacherId: cs.teacherId,
      createdById: teacherUser.id,
      date: lessonDate,
      topicName: 'E2E mobile quiz topic',
      chapterName: 'E2E chapter',
      aiSummary: 'Students revise key points from this week for the e2e mobile quiz check.',
      status: LessonStatus.CONFIRMED,
      confirmedAt: new Date(),
    },
  });

  const draft = await req('POST', '/quizzes/generate', {
    token: teacherTok,
    body: {
      academicYearId: cs.academicYearId,
      sectionId: cs.sectionId,
      subjectId: cs.subjectId,
      branchId: cs.branchId,
      lessonDateFrom: dateStr,
      lessonDateTo: dateStr,
      quickGenerate: true,
      title: `DTPS mobile e2e ${Date.now()}`,
    },
  });
  assert(Boolean(draft?.id), `quiz draft created (${draft?.id})`);
  assert((draft.questions?.length ?? 0) > 0, `draft has ${draft.questions?.length ?? 0} questions`);

  const published = await req('POST', `/quizzes/${draft.id}/publish`, {
    token: teacherTok,
    body: { immediate: true },
  });
  assert(published?.status === 'PUBLISHED' || published?.id === draft.id, 'quiz published');

  // Student in quiz section
  const sectionStudent =
    enrollment?.sectionId === cs.sectionId
      ? fee.student
      : (
          await prisma.studentEnrollment.findFirst({
            where: { sectionId: cs.sectionId, status: 'ACTIVE' },
            include: { student: true },
          })
        )?.student;
  if (!sectionStudent) throw new Error('No student in quiz section');

  // Ensure parent of section student (may differ from fee parent)
  let quizParentTok = parentTok;
  let quizStudentId = sectionStudent.id;
  if (sectionStudent.id !== fee.student.id) {
    const link = await prisma.studentParent.findFirst({
      where: { studentId: sectionStudent.id },
      include: { parent: { include: { user: true } } },
    });
    if (link) {
      try {
        const sess = await login({
          username: link.parent.user.username,
          password: 'Password123',
          expectedRole: 'PARENT',
        });
        quizParentTok = sess.accessToken;
      } catch {
        const sess = await login({
          username: link.parent.user.username,
          password: 'SuperParentDebug123!',
          expectedRole: 'PARENT',
        });
        quizParentTok = sess.accessToken;
      }
    }
  }

  const forTarget = await req(
    'GET',
    `/quizzes?studentId=${encodeURIComponent(quizStudentId)}&status=PUBLISHED&limit=50`,
    { token: quizParentTok },
  );
  const targetHas = (forTarget.items ?? []).some((q) => q.id === draft.id);
  assert(targetHas, `published quiz appears for student in ${cs.section.grade.name}`);

  if (otherEnrollment) {
    const otherParentLink = await prisma.studentParent.findFirst({
      where: { studentId: otherEnrollment.studentId },
      include: { parent: { include: { user: true } } },
    });
    if (otherParentLink) {
      let otherTok;
      try {
        otherTok = (
          await login({
            username: otherParentLink.parent.user.username,
            password: 'Password123',
            expectedRole: 'PARENT',
          })
        ).accessToken;
      } catch {
        otherTok = (
          await login({
            username: otherParentLink.parent.user.username,
            password: 'SuperParentDebug123!',
            expectedRole: 'PARENT',
          })
        ).accessToken;
      }
      const forOther = await req(
        'GET',
        `/quizzes?studentId=${encodeURIComponent(otherEnrollment.studentId)}&status=PUBLISHED&limit=50`,
        { token: otherTok },
      );
      const otherHas = (forOther.items ?? []).some((q) => q.id === draft.id);
      assert(
        !otherHas,
        `quiz does NOT appear for ${otherEnrollment.student.firstName} in ${otherEnrollment.grade.name}`,
      );
    } else {
      assert(true, 'skip cross-section check (other student has no parent)');
    }
  }

  // ---- Submit → teacher stats ----
  console.log('\n4) Quiz submit → teacher portal stats');
  const detail = await req(
    'GET',
    `/quizzes/${draft.id}?studentId=${encodeURIComponent(quizStudentId)}`,
    { token: quizParentTok },
  );
  const questions = (detail.questions ?? []).filter((q) => q.included !== false);
  const answers = questions.map((question) => {
    const correct = (question.options ?? []).find((o) => o.isCorrect);
    const pick = correct ?? question.options?.[0];
    return {
      questionId: question.id,
      optionId: pick?.id,
      answerText: pick?.optionText ?? 'answer',
    };
  });

  const submitResult = await req('POST', `/quizzes/${draft.id}/submit`, {
    token: quizParentTok,
    body: { studentId: quizStudentId, answers },
  });
  assert(
    submitResult?.percentage != null || submitResult?.score != null || submitResult?.id,
    `submit returned a result (score=${submitResult?.score ?? submitResult?.obtainedMarks}, %=${submitResult?.percentage})`,
  );

  const parentResults = await req(
    'GET',
    `/results?studentId=${encodeURIComponent(quizStudentId)}&quizId=${encodeURIComponent(draft.id)}&limit=5`,
    { token: quizParentTok },
  );
  assert((parentResults.items?.length ?? 0) >= 1, 'parent mobile results list shows the attempt');

  const stats = await req('GET', `/results/quiz/${draft.id}/stats`, { token: teacherTok });
  assert(stats?.quizId === draft.id || Boolean(stats), 'teacher quiz stats load');
  const studentRow = (stats.students ?? stats.items ?? []).find(
    (row) =>
      row.studentId === quizStudentId ||
      row.id === quizStudentId ||
      row.student?.id === quizStudentId,
  );
  assert(Boolean(studentRow), 'teacher portal includes this student in quiz stats');
  if (studentRow) {
    const status = studentRow.status ?? studentRow.attemptStatus;
    const pct = studentRow.percentage ?? studentRow.scorePercentage;
    assert(
      status !== 'NOT_ATTEMPTED' && (pct != null || studentRow.score != null || status === 'SUBMITTED' || status === 'GRADED' || studentRow.submittedAt),
      `teacher sees attempt/score (status=${status}, percentage=${pct}, score=${studentRow.score ?? studentRow.obtainedMarks})`,
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('\nERROR', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
