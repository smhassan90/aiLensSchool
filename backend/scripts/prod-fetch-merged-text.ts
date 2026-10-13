/** Fetch merged OCR text from production for a chapter (no upload). */
const BASE = (process.env.HAWKNEXA_API_BASE ?? 'https://hawknexabackend.fynals.com/api/v1').replace(
  /\/$/,
  '',
);
const CHAPTER_ID =
  process.argv.find((a) => a.startsWith('--chapter-id='))?.split('=')[1] ??
  '29fb6129-6564-4bde-9b3c-c113bd81e12d';

type ApiWrap<T> = { success: boolean; data: T };

async function main() {
  const password = (process.env.HAWKNEXA_DEMO_PASSWORD ?? '').trim();
  if (!password) throw new Error('Set HAWKNEXA_DEMO_PASSWORD');
  const username = (process.env.HAWKNEXA_DEMO_USER ?? 'dtps.t03330224616').trim();
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, expectedRole: 'TEACHER' }),
  });
  const loginBody = (await loginRes.json()) as ApiWrap<{ accessToken: string }>;
  if (!loginRes.ok || !loginBody.data?.accessToken) throw new Error('Login failed');
  const token = loginBody.data.accessToken;

  const health = (await fetch(`${BASE}/health`).then((r) => r.json())) as ApiWrap<{
    commit?: string;
  }>;
  const lessonRes = await fetch(`${BASE}/lessons/${CHAPTER_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const lessonBody = (await lessonRes.json()) as ApiWrap<{
    chapterName?: string;
    pageSources?: Array<{
      id: string;
      label: string;
      pageOrder: number;
      mergedOcrText?: string;
      fetchedText?: string;
    }>;
  }>;
  if (!lessonRes.ok) throw new Error('Lesson fetch failed');

  const pages = [...(lessonBody.data.pageSources ?? [])].sort(
    (a, b) => (a.pageOrder ?? 0) - (b.pageOrder ?? 0),
  );

  console.log(`live_commit=${health.data?.commit ?? 'unknown'}`);
  console.log(`chapter=${lessonBody.data.chapterName ?? CHAPTER_ID}`);
  console.log(`pages=${pages.length}`);
  console.log('---');

  for (const p of pages) {
    const merged = (p.mergedOcrText ?? p.fetchedText ?? '').trim();
    console.log(`### ${p.label} (pageOrder ${p.pageOrder})`);
    console.log(merged || '(empty)');
    console.log('---');
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
