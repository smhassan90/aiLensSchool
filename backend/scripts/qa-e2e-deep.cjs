/**
 * Deeper QA: edge cases that often break in production.
 * Run: node scripts/qa-e2e-deep.cjs
 */
const API = process.env.API_URL || 'http://localhost:3001/api/v1';
const bugs = [];
let passed = 0;
let failed = 0;

function ok(n, d = '') {
  passed++;
  console.log(`✓ ${n}${d ? ` — ${d}` : ''}`);
}
function fail(n, d) {
  failed++;
  bugs.push({ n, d });
  console.log(`✗ ${n} — ${d}`);
}
function note(n, d) {
  console.log(`• ${n} — ${d}`);
}

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
    const err = new Error(json?.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return { res, json, data: json?.data, status: res.status, success };
}

async function login(emailOrUser, password) {
  const body = emailOrUser.includes('@')
    ? { email: emailOrUser, password }
    : { username: emailOrUser, password };
  const { data } = await req('POST', '/auth/login', { body });
  return data.accessToken;
}

async function main() {
  console.log(`\n=== DEEP QA @ ${API} ===\n`);

  const saima = await login('t03132623112@tps.school', 'Saim3112!');
  const admin = await login('dtps.waleed', 'DemoAdmin123!');

  // 1) Pre-primary class teacher (Muskan / Level 1) — empty subjectId path
  {
    const { data: teachers } = await req('GET', '/teachers?limit=50&search=Muskan', { token: admin });
    const muskan = (teachers?.items ?? []).find((t) => /muskan/i.test(t.user?.firstName || ''));
    if (!muskan) {
      note('Muskan', 'not in DTPS teacher list');
    } else {
      const phone = (muskan.user.phone || '').replace(/\D/g, '');
      const candidates = [
        `t${phone}@tps.school`,
        `t${phone}@dtps.school`,
        `dtps.t${phone}`,
      ];
      const pass = `Musk${phone.slice(-4)}!`;
      let tok = null;
      for (const id of candidates) {
        try {
          tok = await login(id, pass);
          ok('Muskan login', id);
          break;
        } catch (_) {}
      }
      if (!tok) {
        fail('Muskan login', 'name+phone password failed');
      } else {
        const { data: classes } = await req('GET', '/teachers/me/classes', { token: tok });
        const list = Array.isArray(classes) ? classes : [];
        if (!list.length) fail('Muskan myClasses', 'empty');
        else {
          ok('Muskan myClasses', list.map((c) => `${c.section?.grade?.name} · ${c.subject?.name || c.subjectId}`).join('; '));
          const cls = list[0];
          const { data: enr } = await req(
            'GET',
            `/academics/enrollments?sectionId=${cls.sectionId}&limit=100`,
            { token: tok },
          );
          const students = enr?.items ?? [];
          if (!students.length) fail('Muskan enrollments', '0 students in Level 1');
          else ok('Muskan enrollments', `${students.length}`);

          // Try saving marks with possibly empty subjectId (homeroom "All subjects")
          const studentId = students[0].student?.id ?? students[0].studentId;
          if (!cls.subjectId) {
            note('Muskan subjectId', 'EMPTY — marks form will break');
            const { success, json, status } = await req('POST', '/academics/assessments', {
              token: tok,
              expectOk: false,
              body: {
                studentId,
                subjectId: cls.subjectId || '',
                sectionId: cls.sectionId,
                academicYearId: cls.academicYearId,
                type: 'CLASS_TEST',
                title: 'QA Level1 marks',
                maxMarks: 10,
                marks: 8,
              },
            });
            if (success) {
              fail('Muskan marks with empty subjectId', 'unexpectedly succeeded — data integrity risk');
            } else {
              fail(
                'Muskan / pre-primary marks',
                `cannot save marks: subjectId empty → ${json?.error?.message || status}. Class teacher of Level 1 has no subjects assigned.`,
              );
            }
          } else {
            try {
              await req('POST', '/academics/assessments', {
                token: tok,
                body: {
                  studentId,
                  subjectId: cls.subjectId,
                  sectionId: cls.sectionId,
                  academicYearId: cls.academicYearId,
                  type: 'CLASS_TEST',
                  title: 'QA Level1 marks',
                  maxMarks: 10,
                  marks: 8,
                },
              });
              ok('Muskan save marks');
            } catch (e) {
              fail('Muskan save marks', e.message);
            }
          }

          // Attendance should still work
          try {
            await req('POST', '/attendance', {
              token: tok,
              body: {
                academicYearId: cls.academicYearId,
                sectionId: cls.sectionId,
                branchId: cls.branchId,
                date: new Date().toISOString().slice(0, 10),
                entries: [{ studentId, status: 'PRESENT' }],
              },
            });
            ok('Muskan attendance');
          } catch (e) {
            fail('Muskan attendance', e.message);
          }
        }
      }
    }
  }

  // 2) Duplicate subject names in myClasses (confusing dropdown)
  {
    const { data: classes } = await req('GET', '/teachers/me/classes', { token: saima });
    const keys = (classes || []).map(
      (c) => `${c.section?.grade?.name} ${c.section?.name} · ${c.subject?.name}`,
    );
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length) {
      fail('Duplicate class dropdown labels', [...new Set(dupes)].join(' | '));
    } else {
      ok('No duplicate class dropdown labels', `${keys.length} unique`);
    }
  }

  // 3) Quiz generate + publish
  {
    const { data: classes } = await req('GET', '/teachers/me/classes', { token: saima });
    const cls = (classes || []).find((c) => c.subjectId && c.role === 'TEACHER') || classes?.[0];
    if (cls?.subjectId) {
      try {
        const { data: quiz } = await req('POST', '/quizzes/generate', {
          token: saima,
          body: {
            academicYearId: cls.academicYearId,
            sectionId: cls.sectionId,
            subjectId: cls.subjectId,
            branchId: cls.branchId,
            quickGenerate: true,
            title: `QA Quiz ${Date.now()}`,
          },
        });
        ok('Quiz generate', quiz?.id || JSON.stringify(quiz)?.slice(0, 80));
        if (quiz?.id) {
          try {
            await req('POST', `/quizzes/${quiz.id}/publish`, {
              token: saima,
              body: { immediate: true },
            });
            ok('Quiz publish');
          } catch (e) {
            fail('Quiz publish', e.message);
          }
        }
      } catch (e) {
        fail('Quiz generate', e.message);
      }
    }
  }

  // 4) Fees collect / account for a student
  {
    const { data: students } = await req('GET', '/students?limit=5', { token: admin });
    const st = students?.items?.[0];
    if (st?.id) {
      try {
        const { data: acct } = await req('GET', `/fees/account/${st.id}`, { token: admin });
        ok('Fees account', `student=${st.firstName} balance-ish=${acct?.balance ?? acct?.totalDue ?? 'ok'}`);
      } catch (e) {
        fail('Fees account', e.message);
      }
      try {
        const { data: lookup } = await req(
          'GET',
          `/fees/lookup?q=${encodeURIComponent(st.studentCode || st.firstName)}`,
          { token: admin },
        );
        ok('Fees lookup', Array.isArray(lookup) ? `${lookup.length}` : 'ok');
      } catch (e) {
        fail('Fees lookup', e.message);
      }
    }
  }

  // 5) Invalid enrollment / wrong section mark should fail clearly
  {
    const { data: classes } = await req('GET', '/teachers/me/classes', { token: saima });
    const cls = classes?.[0];
    const { success, json } = await req('POST', '/academics/assessments', {
      token: saima,
      expectOk: false,
      body: {
        studentId: '00000000-0000-0000-0000-000000000000',
        subjectId: cls.subjectId,
        sectionId: cls.sectionId,
        academicYearId: cls.academicYearId,
        type: 'CLASS_TEST',
        title: 'bad',
        maxMarks: 10,
        marks: 1,
      },
    });
    if (!success) ok('Reject marks for unknown student', json?.error?.message || 'rejected');
    else fail('Reject marks for unknown student', 'accepted fake studentId');
  }

  // 6) Portal pages smoke (HTML)
  {
    const pages = [
      'http://localhost:3000/login',
      'http://localhost:3000/teacher/marks',
      'http://localhost:3000/teacher/attendance',
      'http://localhost:3000/school/dashboard',
    ];
    for (const url of pages) {
      try {
        const res = await fetch(url, { redirect: 'manual' });
        if (res.status >= 500) fail(`Portal ${url}`, `HTTP ${res.status}`);
        else ok(`Portal ${url}`, `HTTP ${res.status}`);
      } catch (e) {
        fail(`Portal ${url}`, e.message);
      }
    }
  }

  // 7) Teacher profile / auth me
  {
    try {
      const { data } = await req('GET', '/auth/me', { token: saima });
      ok('Auth me', `${data?.user?.firstName || data?.firstName || ''} role=${data?.roles?.[0] || data?.role || ''}`);
    } catch (e) {
      fail('Auth me', e.message);
    }
  }

  // 8) Homework requires dueDate format issues
  {
    const { data: classes } = await req('GET', '/teachers/me/classes', { token: saima });
    const cls = classes?.find((c) => c.subjectId) || classes?.[0];
    const { success, json } = await req('POST', '/homework', {
      token: saima,
      expectOk: false,
      body: {
        academicYearId: cls.academicYearId,
        sectionId: cls.sectionId,
        subjectId: cls.subjectId,
        branchId: cls.branchId,
        title: 'bad due',
        // missing dueDate
      },
    });
    if (!success) ok('Homework rejects missing dueDate', json?.error?.message || json?.message || 'rejected');
    else fail('Homework validation', 'accepted without dueDate');
  }

  console.log('\n=== DEEP SUMMARY ===');
  console.log(`Passed: ${passed}  Failed: ${failed}`);
  if (bugs.length) {
    console.log('\nBUGS FOUND:');
    bugs.forEach((b, i) => console.log(`  ${i + 1}. ${b.n}: ${b.d}`));
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
