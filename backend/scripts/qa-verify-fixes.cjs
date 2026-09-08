/**
 * Repair + verify pre-primary General subject path.
 * Also probes a few more product bugs.
 */
const API = process.env.API_URL || 'http://localhost:3001/api/v1';

async function req(method, path, { token, body, expectOk = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  const success = res.ok && json?.success !== false;
  if (expectOk && !success) {
    throw new Error(json?.error?.message || `HTTP ${res.status} ${JSON.stringify(json)}`);
  }
  return { res, json, data: json?.data, status: res.status, success };
}

async function login(id, password) {
  const body = id.includes('@') ? { email: id, password } : { username: id, password };
  const { data } = await req('POST', '/auth/login', { body });
  return data.accessToken;
}

async function main() {
  console.log('Waiting for API...');
  for (let i = 0; i < 30; i++) {
    try {
      await req('GET', '/health');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const bugs = [];
  const pass = (n, d = '') => console.log(`✓ ${n}${d ? ` — ${d}` : ''}`);
  const fail = (n, d) => {
    bugs.push(`${n}: ${d}`);
    console.log(`✗ ${n} — ${d}`);
  };

  // Muskan Level 1 marks after fix
  const muskan = await login('t03273889546@tps.school', 'Musk9546!');
  const { data: classes } = await req('GET', '/teachers/me/classes', { token: muskan });
  const list = Array.isArray(classes) ? classes : [];
  console.log('Muskan classes:', list.map((c) => `${c.section?.grade?.name} · ${c.subject?.name} (${c.subjectId})`));
  if (!list.length) fail('Muskan myClasses', 'empty');
  else if (!list[0].subjectId) fail('Muskan subjectId', 'still empty');
  else {
    pass('Muskan has subject', list[0].subject?.name);
    const { data: enr } = await req(
      'GET',
      `/academics/enrollments?sectionId=${list[0].sectionId}&limit=5`,
      { token: muskan },
    );
    const studentId = enr?.items?.[0]?.student?.id ?? enr?.items?.[0]?.studentId;
    try {
      const { data } = await req('POST', '/academics/assessments', {
        token: muskan,
        body: {
          studentId,
          subjectId: list[0].subjectId,
          sectionId: list[0].sectionId,
          academicYearId: list[0].academicYearId,
          type: 'CLASS_TEST',
          title: `QA General ${Date.now()}`,
          maxMarks: 10,
          marks: 9,
        },
      });
      pass('Muskan save marks', data?.id);
    } catch (e) {
      fail('Muskan save marks', e.message);
    }

    // Homework + lesson for pre-primary
    try {
      await req('POST', '/homework', {
        token: muskan,
        body: {
          academicYearId: list[0].academicYearId,
          sectionId: list[0].sectionId,
          subjectId: list[0].subjectId,
          branchId: list[0].branchId,
          title: `QA HW Level1 ${Date.now()}`,
          dueDate: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
        },
      });
      pass('Muskan homework');
    } catch (e) {
      fail('Muskan homework', e.message);
    }
  }

  // Nimra Level 2
  try {
    const admin = await login('dtps.waleed', 'DemoAdmin123!');
    const { data: teachers } = await req('GET', '/teachers?limit=50&search=Nimra', { token: admin });
    const nimra = (teachers?.items ?? []).find((t) => /nimra/i.test(t.user?.firstName || ''));
    const phone = (nimra?.user?.phone || '').replace(/\D/g, '');
    if (phone) {
      let tok = null;
      for (const id of [`t${phone}@tps.school`, `dtps.t${phone}`]) {
        try {
          tok = await login(id, `Nimr${phone.slice(-4)}!`);
          break;
        } catch (_) {}
      }
      if (!tok) fail('Nimra login', 'failed');
      else {
        const { data: nc } = await req('GET', '/teachers/me/classes', { token: tok });
        const nlist = Array.isArray(nc) ? nc : [];
        if (!nlist[0]?.subjectId) fail('Nimra subjectId', 'empty or no classes');
        else pass('Nimra myClasses', `${nlist.length} · ${nlist[0].subject?.name}`);
      }
    }
  } catch (e) {
    fail('Nimra check', e.message);
  }

  // Beginners has students but no class teacher — school admin should still list enrollments
  try {
    const admin = await login('dtps.waleed', 'DemoAdmin123!');
    const { data: grades } = await req('GET', '/academics/grades?limit=50', { token: admin });
    const beginners = (grades?.items ?? grades ?? []).find((g) => /beginners/i.test(g.name));
    if (beginners) {
      const { data: detail } = await req('GET', `/academics/grades/${beginners.id}`, { token: admin });
      const sec = detail?.sections?.[0];
      if (sec && !sec.classTeacherId && !sec.classTeacher) {
        console.log('• Beginners has no class teacher (setup gap) — enrollments:', sec._count?.enrollments);
      }
      if (sec?.id) {
        const { data: enr } = await req(
          'GET',
          `/academics/enrollments?sectionId=${sec.id}&limit=100`,
          { token: admin },
        );
        pass('Beginners enrollments via admin', `${enr?.items?.length ?? 0}`);
      }
    }
  } catch (e) {
    fail('Beginners check', e.message);
  }

  // Quiz generate with homework (real UI path)
  try {
    const saima = await login('t03132623112@tps.school', 'Saim3112!');
    const { data: classes } = await req('GET', '/teachers/me/classes', { token: saima });
    const cls = (classes || []).find((c) => c.subjectId && c.role === 'TEACHER') || classes?.[0];
    const { data: hw } = await req(
      'GET',
      `/homework?sectionId=${cls.sectionId}&subjectId=${cls.subjectId}&limit=5`,
      { token: saima },
    );
    const homeworkIds = (hw?.items ?? []).map((h) => h.id).filter(Boolean).slice(0, 1);
    if (!homeworkIds.length) {
      const created = await req('POST', '/homework', {
        token: saima,
        body: {
          academicYearId: cls.academicYearId,
          sectionId: cls.sectionId,
          subjectId: cls.subjectId,
          branchId: cls.branchId,
          title: `Quiz topic ${Date.now()}`,
          dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        },
      });
      homeworkIds.push(created.data.id);
    }
    const { data: quiz } = await req('POST', '/quizzes/generate', {
      token: saima,
      body: {
        academicYearId: cls.academicYearId,
        sectionId: cls.sectionId,
        subjectId: cls.subjectId,
        branchId: cls.branchId,
        homeworkIds,
        quickGenerate: true,
        title: `QA Quiz ${Date.now()}`,
      },
    });
    pass('Quiz generate with homework', quiz?.id);
    if (quiz?.id) {
      await req('POST', `/quizzes/${quiz.id}/publish`, { token: saima, body: { immediate: true } });
      pass('Quiz publish');
    }
  } catch (e) {
    fail('Quiz flow', e.message);
  }

  console.log('\n=== VERIFY SUMMARY ===');
  if (bugs.length) {
    console.log('BUGS:');
    bugs.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
    process.exit(1);
  }
  console.log('All checks passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
