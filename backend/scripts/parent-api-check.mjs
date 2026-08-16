const BASE = 'http://localhost:3001/api/v1';

async function req(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function unwrap(json) {
  return json?.data ?? json;
}

async function login(username) {
  const { status, json } = await req('/auth/login', {
    method: 'POST',
    body: { username, password: 'Parent123!', expectedRole: 'PARENT' },
  });
  if (status !== 200 && status !== 201) {
    throw new Error(`Login failed for ${username}: ${status} ${JSON.stringify(json)}`);
  }
  const data = unwrap(json);
  return { token: data.accessToken, user: data.user };
}

function fail(msg) {
  console.error('FAIL', msg);
  process.exitCode = 1;
}

function ok(msg) {
  console.log('OK  ', msg);
}

(async () => {
  const father = await login('abc.f.stu001');
  const mother = await login('abc.m.stu001');
  ok(`father login ${father.user.id}`);
  ok(`mother login ${mother.user.id}`);

  const fatherChildren = unwrap((await req('/parents/me/children', { token: father.token })).json);
  const motherChildren = unwrap((await req('/parents/me/children', { token: mother.token })).json);
  if (!Array.isArray(fatherChildren) || fatherChildren.length < 2) {
    fail(`father should have multiple children, got ${fatherChildren?.length}`);
  } else {
    ok(`father children ${fatherChildren.map((c) => c.student.firstName).join(', ')}`);
  }
  if (!Array.isArray(motherChildren) || motherChildren.length !== 1) {
    fail(`mother should have 1 child, got ${motherChildren?.length}`);
  } else {
    ok(`mother children ${motherChildren.map((c) => c.student.firstName).join(', ')}`);
  }

  const fatherIds = new Set(fatherChildren.map((c) => c.student.id));
  const motherIds = new Set(motherChildren.map((c) => c.student.id));
  const shared = [...motherIds].filter((id) => fatherIds.has(id));
  if (!shared.length) fail('expected Ahmed linked to both parents');
  const otherChild = fatherChildren.find((c) => !motherIds.has(c.student.id))?.student;
  const sharedChild = fatherChildren.find((c) => motherIds.has(c.student.id))?.student;
  if (!otherChild || !sharedChild) {
    fail('could not resolve shared vs other child');
    return;
  }

  const fatherSharedQuizzes = unwrap(
    (await req(`/quizzes?studentId=${sharedChild.id}&status=PUBLISHED&limit=50`, { token: father.token })).json,
  );
  const fatherOtherQuizzes = unwrap(
    (await req(`/quizzes?studentId=${otherChild.id}&status=PUBLISHED&limit=50`, { token: father.token })).json,
  );
  const motherQuizzes = unwrap(
    (await req(`/quizzes?studentId=${sharedChild.id}&status=PUBLISHED&limit=50`, { token: mother.token })).json,
  );

  const fatherSharedIds = (fatherSharedQuizzes.items ?? []).map((q) => q.id).sort();
  const motherIdsList = (motherQuizzes.items ?? []).map((q) => q.id).sort();
  if (JSON.stringify(fatherSharedIds) !== JSON.stringify(motherIdsList)) {
    fail(`shared child quizzes mismatch father=${fatherSharedIds} mother=${motherIdsList}`);
  } else {
    ok(`shared child ${sharedChild.firstName} quizzes ${fatherSharedIds.length}`);
  }

  const overlap = (fatherOtherQuizzes.items ?? []).filter((q) => fatherSharedIds.includes(q.id));
  if (overlap.length) {
    fail(`${otherChild.firstName} saw ${overlap.length} quizzes that belong to ${sharedChild.firstName}`);
  } else {
    ok(`${otherChild.firstName} quizzes isolated (${(fatherOtherQuizzes.items ?? []).length} items)`);
  }

  const stolen = await req(`/quizzes?studentId=${otherChild.id}`, { token: mother.token });
  if (stolen.status < 400) fail(`mother listed other parent's child quizzes (${stolen.status})`);
  else ok(`mother blocked from ${otherChild.firstName} quiz list (${stolen.status})`);

  const quizId = fatherSharedIds[0];
  if (quizId) {
    const allowed = await req(`/quizzes/${quizId}?studentId=${sharedChild.id}`, { token: father.token });
    if (allowed.status !== 200) fail(`father cannot open own child quiz ${allowed.status}`);
    else ok('father can open shared child quiz');

    const blocked = await req(`/quizzes/${quizId}?studentId=${otherChild.id}`, { token: father.token });
    if (blocked.status < 400) fail(`wrong child was allowed to open quiz ${blocked.status}`);
    else ok(`quiz detail blocked for wrong child (${blocked.status})`);

    const noStudent = await req(`/quizzes/${quizId}`, { token: father.token });
    if (noStudent.status < 400) fail('quiz detail allowed without studentId');
    else ok(`quiz detail requires studentId (${noStudent.status})`);

    const results = unwrap(
      (await req(`/results?studentId=${sharedChild.id}&quizId=${quizId}&limit=1`, { token: father.token })).json,
    );
    ok(`results for ${sharedChild.firstName}: ${(results.items ?? []).length}`);

    const wrongResults = await req(`/results?studentId=${otherChild.id}`, { token: mother.token });
    if (wrongResults.status < 400) fail('mother fetched other child results');
    else ok(`mother blocked from other child results (${wrongResults.status})`);
  } else {
    ok('no published quiz for shared child — list isolation still verified');
  }

  const endpoints = [
    `/homework?studentId=${sharedChild.id}&limit=5`,
    `/lessons?studentId=${sharedChild.id}&limit=5`,
    `/attendance?studentId=${sharedChild.id}&limit=5`,
    `/fees?studentId=${sharedChild.id}&limit=5`,
    `/documents/diaries?studentId=${sharedChild.id}&limit=5`,
    `/documents/report-cards?studentId=${sharedChild.id}&limit=5`,
    `/announcements?status=PUBLISHED&limit=5`,
    `/events?limit=5`,
    `/notifications?limit=5`,
    `/auth/me`,
  ];
  for (const path of endpoints) {
    const { status, json } = await req(path, { token: father.token });
    if (status !== 200) fail(`${path} -> ${status} ${json?.message ?? ''}`);
    else ok(`${path} -> 200`);
  }

  const hw = unwrap((await req(`/homework?studentId=${sharedChild.id}&limit=1`, { token: father.token })).json);
  const hwId = hw.items?.[0]?.id;
  if (hwId) {
    const hwOk = await req(`/homework/${hwId}?studentId=${sharedChild.id}`, { token: father.token });
    if (hwOk.status !== 200) fail(`homework detail ${hwOk.status}`);
    else ok('homework detail for own child');
    const hwWrong = await req(`/homework/${hwId}?studentId=${otherChild.id}`, { token: father.token });
    if (hwWrong.status < 400) fail('homework detail allowed for wrong child');
    else ok(`homework detail blocked for wrong child (${hwWrong.status})`);
  }

  const motherFees = await req(`/fees?studentId=${otherChild.id}`, { token: mother.token });
  if (motherFees.status < 400) fail('mother listed fees for unlinked child');
  else ok(`fees ownership enforced (${motherFees.status})`);

  if (process.exitCode) {
    console.error('\nParent API checks finished with failures');
  } else {
    console.log('\nParent API checks passed');
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
