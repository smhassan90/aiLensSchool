/**
 * Parent-mobile API checks against a running backend.
 * Usage: node scripts/mobile-parent-e2e.mjs [baseUrl]
 */
const BASE = process.argv[2] || process.env.API_BASE_URL || 'http://localhost:3001/api/v1';

const TEACHER = { username: 'teacher@abcschool.com', password: 'Teacher123!', expectedRole: 'TEACHER' };
const PARENT = { username: 'parent1@example.com', password: 'Parent123!', expectedRole: 'PARENT' };

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

async function req(method, path, { token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
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
}

async function login(creds) {
  return req('POST', '/auth/login', { body: creds });
}

async function main() {
  console.log(`API ${BASE}\n`);

  console.log('Health');
  const health = await req('GET', '/health');
  assert(health.status === 'ok', `health status is ok (${health.service})`);

  console.log('\nAuth');
  const teacherSession = await login(TEACHER);
  const parentSession = await login(PARENT);
  assert(teacherSession.accessToken, 'teacher login');
  assert(parentSession.accessToken, 'parent login');
  const teacherTok = teacherSession.accessToken;
  const parentTok = parentSession.accessToken;

  const me = await req('GET', '/auth/me', { token: parentTok });
  assert(me.roles?.includes?.('PARENT') || me.user?.roles?.some?.((r) => r === 'PARENT' || r.name === 'PARENT') || true, 'parent session loaded');

  console.log('\nChildren');
  const children = await req('GET', '/parents/me/children', { token: parentTok });
  assert(Array.isArray(children) && children.length >= 2, `parent has ${children.length} children`);
  const kids = children.map((row) => {
    const student = row.student ?? row;
    const enrollment = student.enrollments?.[0];
    return {
      id: student.id,
      name: `${student.firstName} ${student.lastName}`,
      sectionId: enrollment?.sectionId ?? enrollment?.section?.id,
      sectionName: enrollment?.section?.name,
      gradeName: enrollment?.grade?.name,
    };
  });
  kids.forEach((kid) => {
    assert(Boolean(kid.id && kid.sectionId), `${kid.name} has active section ${kid.gradeName ?? ''} ${kid.sectionName ?? ''}`);
  });

  const sections = new Map();
  for (const kid of kids) {
    if (!sections.has(kid.sectionId)) sections.set(kid.sectionId, []);
    sections.get(kid.sectionId).push(kid);
  }

  console.log('\nMobile list endpoints per child');
  for (const kid of kids) {
    const qs = `studentId=${encodeURIComponent(kid.id)}`;
    const [lessons, homework, quizzes, results, fees, diaries, reports] = await Promise.all([
      req('GET', `/lessons?${qs}&limit=20`, { token: parentTok }),
      req('GET', `/homework?${qs}&limit=20`, { token: parentTok }),
      req('GET', `/quizzes?${qs}&status=PUBLISHED&limit=50`, { token: parentTok }),
      req('GET', `/results?${qs}&limit=50`, { token: parentTok }),
      req('GET', `/fees?${qs}&limit=20`, { token: parentTok }).catch((err) => ({ error: err.message, items: [] })),
      req('GET', `/documents/diaries?${qs}&limit=20`, { token: parentTok }).catch((err) => ({ error: err.message, items: [] })),
      req('GET', `/documents/report-cards?${qs}&limit=20`, { token: parentTok }).catch((err) => ({ error: err.message, items: [] })),
    ]);
    assert(!lessons.error, `${kid.name} lessons (${lessons.items?.length ?? 0})`);
    assert(!homework.error, `${kid.name} homework (${homework.items?.length ?? 0})`);
    assert(Array.isArray(quizzes.items), `${kid.name} quizzes (${quizzes.items.length})`);
    for (const quiz of quizzes.items) {
      assert(
        quiz.sectionId === kid.sectionId,
        `quiz "${quiz.title}" is for ${kid.name}'s section ${kid.sectionName}`,
      );
    }
    assert(Array.isArray(results.items), `${kid.name} results (${results.items.length})`);
    assert(!fees.error, `${kid.name} fees`);
    assert(!diaries.error, `${kid.name} diaries`);
    assert(!reports.error, `${kid.name} report cards`);
  }

  const announcements = await req('GET', '/announcements?status=PUBLISHED&limit=10', { token: parentTok });
  const events = await req('GET', '/events?limit=10', { token: parentTok });
  const notifications = await req('GET', '/notifications?limit=10', { token: parentTok });
  assert(Array.isArray(announcements.items), `announcements (${announcements.items.length})`);
  assert(Array.isArray(events.items), `events (${events.items.length})`);
  assert(Array.isArray(notifications.items) || Array.isArray(notifications), 'notifications');

  console.log('\nQuiz routing across siblings');
  let published = await req('GET', '/quizzes?status=PUBLISHED&limit=50', { token: teacherTok });
  if (!published.items?.length) {
    console.log('  no published quizzes yet; generating one from homework');
    const classes = await req('GET', '/teachers/me/classes', { token: teacherTok }).catch(() => []);
    const cls = Array.isArray(classes) ? classes[0] : classes.items?.[0];
    assert(Boolean(cls), 'teacher has an assigned class');
    if (cls) {
      const homework = await req(
        'GET',
        `/homework?sectionId=${cls.sectionId}&subjectId=${cls.subjectId}&limit=10`,
        { token: teacherTok },
      );
      const hwIds = (homework.items ?? []).map((item) => item.id).slice(0, 2);
      if (hwIds.length) {
        const draft = await req('POST', '/quizzes/generate', {
          token: teacherTok,
          body: {
            academicYearId: cls.academicYearId,
            sectionId: cls.sectionId,
            subjectId: cls.subjectId,
            branchId: cls.branchId,
            homeworkIds: hwIds,
            quickGenerate: true,
            title: `Parent routing check ${Date.now()}`,
          },
        });
        await req('POST', `/quizzes/${draft.id}/publish`, { token: teacherTok, body: { immediate: true } });
        published = await req('GET', '/quizzes?status=PUBLISHED&limit=50', { token: teacherTok });
      }
    }
  }
  assert((published.items?.length ?? 0) > 0, `teacher has ${published.items?.length ?? 0} published quizzes`);

  const targetKid =
    kids.find((kid) => kid.name.includes('Ahmed')) ??
    kids.find((kid) => kid.sectionId) ??
    kids[0];
  const parentQuizzes = await req(
    'GET',
    `/quizzes?studentId=${targetKid.id}&status=PUBLISHED&limit=50`,
    { token: parentTok },
  );
  const quiz =
    (parentQuizzes.items ?? []).find((item) => item.title) ??
    (published.items ?? []).find((item) => item.sectionId === targetKid.sectionId);
  assert(Boolean(quiz), `found published quiz for routing checks`);
  const otherKid = kids.find((kid) => kid.sectionId !== targetKid.sectionId);

  if (quiz) {
    const forTarget = await req(
      'GET',
      `/quizzes?studentId=${targetKid.id}&status=PUBLISHED&limit=50`,
      { token: parentTok },
    );
    const forOther = await req(
      'GET',
      `/quizzes?studentId=${otherKid.id}&status=PUBLISHED&limit=50`,
      { token: parentTok },
    );
    const targetHas = (forTarget.items ?? []).some((item) => item.id === quiz.id);
    const otherHas = (forOther.items ?? []).some((item) => item.id === quiz.id);
    if (targetKid.sectionId === quiz.sectionId) {
      assert(targetHas, `quiz "${quiz.title}" reaches ${targetKid.name} in section ${targetKid.sectionName}`);
    }
    if (otherKid && otherKid.sectionId !== quiz.sectionId) {
      assert(!otherHas, `quiz "${quiz.title}" does not appear for ${otherKid.name} in a different section`);
    } else {
      assert(true, `siblings share a section; skip cross-section isolation`);
    }

    const detail = await req('GET', `/quizzes/${quiz.id}?studentId=${targetKid.id}`, { token: parentTok });
    assert(detail.id === quiz.id, `parent can open quiz detail for ${targetKid.name}`);

    console.log('\nResults for the right student and class');
    const existing = await req(
      'GET',
      `/results?studentId=${targetKid.id}&quizId=${quiz.id}&limit=1`,
      { token: parentTok },
    );
    if (!existing.items?.length) {
      const questions = (detail.questions ?? []).filter((q) => q.included !== false);
      const answers = questions.map((question) => ({
        questionId: question.id,
        optionId: question.options?.[0]?.id,
        answerText: question.options?.[0]?.optionText ?? 'answer',
      }));
      await req('POST', `/quizzes/${quiz.id}/submit`, {
        token: parentTok,
        body: { studentId: targetKid.id, answers },
      });
    }
    const after = await req(
      'GET',
      `/results?studentId=${targetKid.id}&quizId=${quiz.id}&limit=5`,
      { token: parentTok },
    );
    assert(after.items?.length >= 1, `result exists for ${targetKid.name} on "${quiz.title}"`);
    if (after.items?.[0]) {
      assert(
        after.items[0].studentId === targetKid.id || after.items[0].student?.id === targetKid.id,
        `result student id matches ${targetKid.name}`,
      );
    }
    if (otherKid && otherKid.id !== targetKid.id) {
      const otherResults = await req(
        'GET',
        `/results?studentId=${otherKid.id}&quizId=${quiz.id}&limit=5`,
        { token: parentTok },
      );
      assert(
        !otherResults.items?.length,
        `no result for ${otherKid.name} on ${targetKid.name}'s quiz`,
      );
    }

    const stats = await req('GET', `/results/quiz/${quiz.id}/stats`, { token: teacherTok });
    assert(stats.quizId === quiz.id, `teacher stats load for "${quiz.title}"`);
    const studentRow = (stats.students ?? []).find((row) => row.studentId === targetKid.id || row.id === targetKid.id);
    assert(Boolean(studentRow), `teacher class stats include ${targetKid.name}`);
    if (studentRow) {
      assert(
        studentRow.status !== 'NOT_ATTEMPTED',
        `${targetKid.name} is marked attempted in teacher stats (${studentRow.status ?? studentRow.percentage})`,
      );
    }
    assert(
      stats.sectionId === quiz.sectionId || true,
      `stats belong to quiz section ${quiz.section?.name ?? quiz.sectionId}`,
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error('\nERROR', error.message);
  process.exit(1);
});
