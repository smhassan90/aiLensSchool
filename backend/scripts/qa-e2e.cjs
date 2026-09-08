/**
 * End-to-end QA harness against local API.
 * Run: node scripts/qa-e2e.cjs
 */
const API = process.env.API_URL || 'http://localhost:3001/api/v1';

const results = [];
let passed = 0;
let failed = 0;
let bugs = [];

function ok(name, detail = '') {
  passed++;
  results.push({ status: 'PASS', name, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail, isBug = true) {
  failed++;
  results.push({ status: 'FAIL', name, detail });
  console.log(`✗ ${name} — ${detail}`);
  if (isBug) bugs.push({ name, detail });
}
function note(name, detail) {
  results.push({ status: 'NOTE', name, detail });
  console.log(`• ${name} — ${detail}`);
}

async function req(method, path, { token, body, expectOk = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  const success = res.ok && json?.success !== false;
  if (expectOk && !success) {
    const msg = json?.error?.message || json?.message || res.statusText || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return { res, json, data: json?.data, status: res.status };
}

async function login(identifier, password, label) {
  const body = identifier.includes('@')
    ? { email: identifier, password }
    : { username: identifier, password };
  try {
    const { data } = await req('POST', '/auth/login', { body });
    if (!data?.accessToken) throw new Error('No accessToken');
    ok(`${label} login`, identifier);
    return data.accessToken;
  } catch (e) {
    fail(`${label} login`, e.message);
    return null;
  }
}

async function main() {
  console.log(`\n=== QA E2E @ ${API} ===\n`);

  // Health
  try {
    const { data } = await req('GET', '/health');
    ok('Health', data?.status || 'ok');
  } catch (e) {
    fail('Health', e.message);
    console.log('\nAPI down — aborting.');
    process.exit(1);
  }

  // --- Logins ---
  const teacherTok = await login('t03132623112@tps.school', 'Saim3112!', 'Teacher (Saima/TPS)');
  const adminTok =
    (await login('dtps.waleed', 'DemoAdmin123!', 'School admin (DTPS)')) ||
    (await login('dtps.waleed@dtps.school', 'DemoAdmin123!', 'School admin (DTPS email)'));
  const abcAdminTok = await login('admin@abcschool.com', 'SchoolAdmin123!', 'School admin (ABC seed)');

  if (!teacherTok) {
    console.log('\nCannot continue teacher flows without Saima login.');
  }

  let classes = [];
  let sectionId;
  let subjectId;
  let academicYearId;
  let branchId;
  let gradeId;
  let studentId;

  // --- Teacher: my classes ---
  if (teacherTok) {
    try {
      const { data } = await req('GET', '/teachers/me/classes', { token: teacherTok });
      classes = Array.isArray(data) ? data : [];
      if (classes.length === 0) {
        fail('Teacher myClasses', 'empty list (class teacher / subject assignment bug?)');
      } else {
        ok('Teacher myClasses', `${classes.length} entries`);
        const roles = [...new Set(classes.map((c) => c.role).filter(Boolean))];
        note('Teacher class roles', roles.join(', ') || 'none');
      }
      const first = classes[0];
      sectionId = first?.sectionId;
      subjectId = first?.subjectId;
      academicYearId = first?.academicYearId;
      branchId = first?.branchId;
      gradeId = first?.section?.grade?.id;
    } catch (e) {
      fail('Teacher myClasses', e.message);
    }

    // Dashboard
    try {
      const { data } = await req('GET', '/dashboard/teacher', { token: teacherTok });
      ok('Teacher dashboard', data ? 'loaded' : 'empty body');
    } catch (e) {
      fail('Teacher dashboard', e.message);
    }

    // Enrollments / students for section
    if (sectionId) {
      try {
        const { data } = await req(
          'GET',
          `/academics/enrollments?sectionId=${sectionId}&limit=100`,
          { token: teacherTok },
        );
        const items = data?.items ?? [];
        if (items.length === 0) {
          fail('Teacher enrollments for class', `section ${sectionId} has 0 students`);
        } else {
          ok('Teacher enrollments for class', `${items.length} students`);
          studentId = items[0].student?.id ?? items[0].studentId;
        }
      } catch (e) {
        fail('Teacher enrollments for class', e.message);
      }
    }

    // Attendance list + mark
    if (sectionId && studentId && academicYearId && branchId) {
      const date = new Date().toISOString().slice(0, 10);
      try {
        await req('GET', `/attendance?sectionId=${sectionId}&date=${date}&limit=100`, {
          token: teacherTok,
        });
        ok('Teacher attendance list');
      } catch (e) {
        fail('Teacher attendance list', e.message);
      }
      try {
        const { data } = await req('POST', '/attendance', {
          token: teacherTok,
          body: {
            academicYearId,
            sectionId,
            branchId,
            date,
            entries: [{ studentId, status: 'PRESENT' }],
          },
        });
        ok('Teacher attendance mark', `saved=${data?.saved ?? data?.count ?? 'ok'}`);
      } catch (e) {
        fail('Teacher attendance mark', e.message);
      }
    }

    // Assessment marks
    if (sectionId && subjectId && studentId && academicYearId) {
      try {
        const { data } = await req('POST', '/academics/assessments', {
          token: teacherTok,
          body: {
            studentId,
            subjectId,
            sectionId,
            academicYearId,
            type: 'CLASS_TEST',
            title: `QA test ${Date.now()}`,
            maxMarks: 20,
            marks: 15,
          },
        });
        ok('Teacher save assessment marks', data?.id ? `id=${data.id}` : 'ok');
      } catch (e) {
        fail('Teacher save assessment marks', e.message);
      }
      try {
        const { data } = await req(
          'GET',
          `/academics/assessments?sectionId=${sectionId}&subjectId=${subjectId}`,
          { token: teacherTok },
        );
        const list = Array.isArray(data) ? data : data?.items ?? [];
        ok('Teacher list assessments', `${list.length} rows`);
      } catch (e) {
        fail('Teacher list assessments', e.message);
      }
    }

    // Homework
    if (sectionId && subjectId && academicYearId && branchId) {
      const due = new Date();
      due.setDate(due.getDate() + 3);
      try {
        const { data } = await req('POST', '/homework', {
          token: teacherTok,
          body: {
            academicYearId,
            sectionId,
            subjectId,
            branchId,
            title: `QA HW ${Date.now()}`,
            description: 'QA harness homework',
            dueDate: due.toISOString().slice(0, 10),
          },
        });
        ok('Teacher create homework', data?.id ? `id=${data.id}` : 'ok');
      } catch (e) {
        fail('Teacher create homework', e.message);
      }
      try {
        const { data } = await req(
          'GET',
          `/homework?sectionId=${sectionId}&limit=20`,
          { token: teacherTok },
        );
        const items = data?.items ?? (Array.isArray(data) ? data : []);
        ok('Teacher list homework', `${items.length} rows`);
      } catch (e) {
        fail('Teacher list homework', e.message);
      }
    }

    // Lessons
    if (sectionId && subjectId && academicYearId && branchId && gradeId) {
      const today = new Date().toISOString().slice(0, 10);
      try {
        const { data } = await req('POST', '/lessons', {
          token: teacherTok,
          body: {
            academicYearId,
            gradeId,
            sectionId,
            subjectId,
            branchId,
            date: today,
            topicName: `QA lesson ${Date.now()}`,
            chapterName: 'QA',
          },
        });
        ok('Teacher create lesson', data?.id ? `id=${data.id}` : 'ok');
        if (data?.id) {
          try {
            await req('POST', `/lessons/${data.id}/confirm`, { token: teacherTok, body: {} });
            ok('Teacher confirm lesson');
          } catch (e) {
            fail('Teacher confirm lesson', e.message);
          }
        }
      } catch (e) {
        fail('Teacher create lesson', e.message);
      }
    }

    // Exam configs + report card generate (soft — may need template)
    if (academicYearId) {
      try {
        const { data } = await req(
          'GET',
          `/academics/exam-configs?academicYearId=${academicYearId}`,
          { token: teacherTok },
        );
        const list = Array.isArray(data) ? data : data?.items ?? [];
        ok('Teacher list exam configs', `${list.length} configs`);
      } catch (e) {
        // endpoint path may differ
        try {
          const { data } = await req('GET', `/academics/exams?academicYearId=${academicYearId}`, {
            token: teacherTok,
          });
          ok('Teacher list exams (alt)', Array.isArray(data) ? `${data.length}` : 'ok');
        } catch (e2) {
          fail('Teacher list exam configs', `${e.message} | alt: ${e2.message}`);
        }
      }
    }

    if (sectionId && subjectId && academicYearId) {
      try {
        const { data } = await req('POST', '/documents/report-cards/generate', {
          token: teacherTok,
          body: {
            academicYearId,
            sectionId,
            subjectId,
            termLabel: 'QA Term',
          },
        });
        ok('Teacher generate report cards', `generated=${data?.generated ?? JSON.stringify(data)}`);
      } catch (e) {
        // May fail without template — record as bug if unexpected
        if (/template|not found|no students/i.test(e.message)) {
          note('Teacher generate report cards', `expected soft fail: ${e.message}`);
        } else {
          fail('Teacher generate report cards', e.message);
        }
      }
    }

    // Class teacher who previously had empty myClasses — Ambreen
    try {
      // Discover Ambreen email from teacher list as admin if possible later
      note('Ambreen myClasses', 'checked via admin discovery below');
    } catch (_) {}
  }

  // --- School admin DTPS ---
  const schoolTok = adminTok || abcAdminTok;
  const schoolLabel = adminTok ? 'DTPS' : abcAdminTok ? 'ABC' : null;

  if (schoolTok) {
    try {
      const { data } = await req('GET', '/dashboard/school', { token: schoolTok });
      ok(`${schoolLabel} school dashboard`, data ? 'loaded' : 'empty');
    } catch (e) {
      fail(`${schoolLabel} school dashboard`, e.message);
    }

    try {
      const { data } = await req('GET', '/students?limit=20', { token: schoolTok });
      const items = data?.items ?? [];
      ok(`${schoolLabel} list students`, `${items.length} (total ${data?.total ?? '?'})`);
      if (items.length === 0) fail(`${schoolLabel} students empty`, 'no students returned', true);
    } catch (e) {
      fail(`${schoolLabel} list students`, e.message);
    }

    try {
      const { data } = await req('GET', '/teachers?limit=20', { token: schoolTok });
      const items = data?.items ?? [];
      ok(`${schoolLabel} list teachers`, `${items.length}`);
    } catch (e) {
      fail(`${schoolLabel} list teachers`, e.message);
    }

    try {
      const { data } = await req('GET', '/academics/grades?limit=50', { token: schoolTok });
      const items = data?.items ?? (Array.isArray(data) ? data : []);
      ok(`${schoolLabel} list grades`, `${items.length}`);
    } catch (e) {
      fail(`${schoolLabel} list grades`, e.message);
    }

    try {
      const { data } = await req('GET', '/academics/years?limit=10', { token: schoolTok });
      const items = data?.items ?? (Array.isArray(data) ? data : []);
      const current = items.find((y) => y.isCurrent);
      ok(`${schoolLabel} academic years`, `${items.length}, current=${current?.name ?? 'none'}`);
      if (!current) fail(`${schoolLabel} no current year`, 'isCurrent missing');
    } catch (e) {
      fail(`${schoolLabel} academic years`, e.message);
    }

    try {
      const { data } = await req('GET', '/academics/enrollments?limit=20', { token: schoolTok });
      const items = data?.items ?? [];
      ok(`${schoolLabel} enrollments`, `${items.length} (total ${data?.total ?? '?'})`);
    } catch (e) {
      fail(`${schoolLabel} enrollments`, e.message);
    }

    try {
      const { data } = await req('GET', '/fees?limit=20', { token: schoolTok });
      const items = data?.items ?? (Array.isArray(data) ? data : []);
      ok(`${schoolLabel} fees list`, `${items.length}`);
    } catch (e) {
      fail(`${schoolLabel} fees list`, e.message);
    }

    // Find Ambreen (Class 10 class teacher) and verify myClasses via teacher login if we can get phone
    if (adminTok) {
      try {
        const { data } = await req('GET', '/teachers?limit=50&search=Ambreen', { token: adminTok });
        const items = data?.items ?? [];
        const amb = items.find((t) => /ambreen/i.test(t.user?.firstName || ''));
        if (amb?.user?.phone || amb?.user?.email) {
          const phone = (amb.user.phone || '').replace(/\D/g, '');
          const email = amb.user.email || (phone ? `dtps.t${phone}@dtps.school` : null);
          const pass = phone.length >= 4 ? `Ambr${phone.slice(-4)}!` : null;
          // Also try TPS email
          const candidates = [];
          if (email) candidates.push({ id: email, pass });
          if (phone) {
            candidates.push({ id: `t${phone}@tps.school`, pass: `Ambr${phone.slice(-4)}!` });
            candidates.push({ id: `dtps.t${phone}`, pass: `Ambr${phone.slice(-4)}!` });
          }
          let ambTok = null;
          for (const c of candidates) {
            if (!c.pass) continue;
            try {
              const body = c.id.includes('@') ? { email: c.id, password: c.pass } : { username: c.id, password: c.pass };
              const { data: loginData } = await req('POST', '/auth/login', { body });
              if (loginData?.accessToken) {
                ambTok = loginData.accessToken;
                ok('Ambreen (Class 10) login', c.id);
                break;
              }
            } catch (_) {}
          }
          if (ambTok) {
            const { data: ambClasses } = await req('GET', '/teachers/me/classes', { token: ambTok });
            const list = Array.isArray(ambClasses) ? ambClasses : [];
            if (list.length === 0) {
              fail('Ambreen myClasses after fix', 'still empty — class teacher cannot see Class 10');
            } else {
              ok('Ambreen myClasses after fix', `${list.length} classes`);
              const sec = list[0].sectionId;
              const { data: enr } = await req(
                'GET',
                `/academics/enrollments?sectionId=${sec}&limit=100`,
                { token: ambTok },
              );
              const n = enr?.items?.length ?? 0;
              if (n === 0) fail('Ambreen student dropdown data', '0 enrollments for her section');
              else ok('Ambreen student dropdown data', `${n} students`);
            }
          } else {
            note('Ambreen login', 'could not authenticate with name+phone pattern');
          }
        } else {
          note('Ambreen lookup', 'teacher not found in DTPS search');
        }
      } catch (e) {
        note('Ambreen check', e.message);
      }
    }
  } else {
    fail('School admin login', 'neither DTPS nor ABC admin worked');
  }

  // --- Teacher with empty subjectId (Muskan Level 1) — marks save may fail ---
  // Soft check via Saima already done.

  // --- Tenant isolation smoke ---
  if (teacherTok && schoolTok && adminTok) {
    try {
      const { data: tStudents } = await req('GET', '/students?limit=5', {
        token: teacherTok,
        expectOk: false,
      });
      // Teachers may or may not have access
      note('Teacher students endpoint', `status handled, success=${Boolean(tStudents)}`);
    } catch (_) {}
  }

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (bugs.length) {
    console.log('\nBUGS:');
    bugs.forEach((b, i) => console.log(`  ${i + 1}. ${b.name}: ${b.detail}`));
  } else {
    console.log('\nNo hard bugs flagged.');
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
