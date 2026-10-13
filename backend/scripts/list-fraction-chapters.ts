const BASE = (process.env.HAWKNEXA_API_BASE ?? 'https://hawknexabackend.fynals.com/api/v1').replace(/\/$/, '');
async function main() {
  const password = (process.env.HAWKNEXA_DEMO_PASSWORD ?? '').trim();
  if (!password) throw new Error('Set HAWKNEXA_DEMO_PASSWORD');
  const username = (process.env.HAWKNEXA_DEMO_USER ?? 'dtps.t03330224616').trim();
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, expectedRole: 'TEACHER' }),
  });
  const loginBody = (await loginRes.json()) as { data?: { accessToken: string } };
  const token = loginBody.data?.accessToken;
  if (!token) throw new Error('Login failed');
  const classes = (await fetch(`${BASE}/teachers/me/classes`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json())) as { data?: Array<{ subjectId: string; subject?: { name: string } }> };
  const math = classes.data?.find((c) => /math/i.test(c.subject?.name ?? '')) ?? classes.data?.[0];
  if (!math) throw new Error('no class');
  const chapters = (await fetch(`${BASE}/lessons/chapters?limit=100&subjectId=${math.subjectId}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json())) as {
    data?: Array<{ id: string; chapterName?: string; pageCount?: number }>;
  };
  for (const c of chapters.data ?? []) {
    if (!/fraction/i.test(c.chapterName ?? '')) continue;
    const lesson = (await fetch(`${BASE}/lessons/${c.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json())) as { data?: { pageSources?: unknown[] } };
    const n = lesson.data?.pageSources?.length ?? c.pageCount ?? 0;
    console.log(`${n} pages\t${c.id}\t${c.chapterName}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
