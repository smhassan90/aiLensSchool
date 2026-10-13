/**
 * Authenticated production OCR test for fractions pages (2.jpg–4.jpg).
 * Credentials: HAWKNEXA_DEMO_USER (default dtps.t03330224616), HAWKNEXA_DEMO_PASSWORD (required).
 * Never logs tokens or passwords.
 *
 * Usage (backend/):
 *   npx tsx scripts/prod-fractions-ocr-api-test.ts --page=2 [--chapter-id=uuid] [--replace]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const BASE = (process.env.HAWKNEXA_API_BASE ?? 'https://hawknexabackend.fynals.com/api/v1').replace(
  /\/$/,
  '',
);
const TEST_CHAPTER_PREFIX = 'OCR-FRACTIONS-CAL';
const UPLOAD_DIR = join(__dirname, '../test-fixtures/fractions-teacher-upload');
const OUT_DIR = join(__dirname, '../var/fractions-pages-debug');

type ApiWrap<T> = { success: boolean; data: T };

async function apiJson<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Non-JSON ${res.status} ${path}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg =
      typeof body === 'object' && body && 'message' in body
        ? String((body as { message: unknown }).message)
        : text.slice(0, 300);
    throw new Error(`HTTP ${res.status} ${path}: ${msg}`);
  }
  const wrapped = body as ApiWrap<T> | T;
  if (wrapped && typeof wrapped === 'object' && 'success' in wrapped && 'data' in wrapped) {
    return (wrapped as ApiWrap<T>).data;
  }
  return wrapped as T;
}

async function login(): Promise<string> {
  const username = (process.env.HAWKNEXA_DEMO_USER ?? 'dtps.t03330224616').trim();
  const password = (process.env.HAWKNEXA_DEMO_PASSWORD ?? '').trim();
  if (!password) {
    throw new Error('Set HAWKNEXA_DEMO_PASSWORD in the environment (do not commit).');
  }
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username, password, expectedRole: 'TEACHER' }),
  });
  const text = await res.text();
  const body = JSON.parse(text) as ApiWrap<{ accessToken: string }>;
  if (!res.ok || !body?.data?.accessToken) {
    throw new Error(`Login failed (${res.status})`);
  }
  return body.data.accessToken;
}

type TeacherClass = {
  academicYearId: string;
  sectionId: string;
  subjectId: string;
  branchId: string;
  section?: { grade?: { id: string; name?: string }; name?: string };
  subject?: { id: string; name?: string };
};

type PageSource = {
  id: string;
  pageOrder: number;
  label: string;
  paddleOcrText?: string;
  tesseractOcrText?: string;
  mergedOcrText?: string;
  fetchedText?: string;
};

type Lesson = {
  id: string;
  chapterName?: string;
  pageSources?: PageSource[];
};

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function pollOcrProgress(
  token: string,
  chapterId: string,
  uploadId: string,
  maxMs = 600_000,
) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const p = await apiJson<{
      phase?: string;
      message?: string;
      paddle?: string;
      tesseract?: string;
      merge?: string;
    }>(`/lessons/chapters/${chapterId}/ocr-upload-progress/${encodeURIComponent(uploadId)}`, token);
    const phase = p?.phase ?? '';
    if (phase === 'done' || phase === 'complete' || phase === 'finished') return p;
    if (phase === 'error') throw new Error(p.message ?? 'OCR progress error');
    await sleep(2500);
  }
  throw new Error('OCR progress timed out');
}

async function uploadPage(
  token: string,
  chapterId: string,
  filePath: string,
  replaceSourceId?: string,
): Promise<void> {
  const buf = readFileSync(filePath);
  const name = filePath.split(/[/\\]/).pop() ?? 'page.jpg';
  const uploadId = randomUUID();
  const form = new FormData();
  form.append('pages', new Blob([buf], { type: 'image/jpeg' }), name);

  const query = `?uploadId=${encodeURIComponent(uploadId)}`;
  const path = replaceSourceId
    ? `/lessons/chapters/${chapterId}/pages/${replaceSourceId}/replace-photo${query}`
    : `/lessons/chapters/${chapterId}/append-photos${query}`;

  await apiJson<Lesson>(path, token, { method: 'POST', body: form });
  await pollOcrProgress(token, chapterId, uploadId);
}

async function ensureTestChapter(token: string, forcedId?: string): Promise<string> {
  if (forcedId) return forcedId;

  const classes = await apiJson<TeacherClass[]>('/teachers/me/classes', token);
  if (!classes?.length) throw new Error('Teacher has no assigned classes');
  const math =
    classes.find((c) => /math/i.test(c.subject?.name ?? '')) ?? classes[0]!;
  const gradeId = math.section?.grade?.id;
  if (!gradeId) throw new Error('Could not resolve gradeId from teacher class');

  const chapters = await apiJson<Lesson[]>(
    `/lessons/chapters?limit=100&subjectId=${encodeURIComponent(math.subjectId)}`,
    token,
  );
  const existing = chapters.find((c) =>
    (c.chapterName ?? '').startsWith(TEST_CHAPTER_PREFIX),
  );
  if (existing?.id) return existing.id;

  const draft = await apiJson<Lesson>('/lessons/chapters/draft', token, {
    method: 'POST',
    body: JSON.stringify({
      academicYearId: math.academicYearId,
      gradeId,
      sectionId: math.sectionId,
      subjectId: math.subjectId,
      branchId: math.branchId,
      chapterName: `${TEST_CHAPTER_PREFIX} fractions pages 2-4`,
      topicName: 'Agent OCR calibration — do not use for teaching',
    }),
  });
  return draft.id;
}

function parseArgs() {
  const page = process.argv.find((a) => a.startsWith('--page='))?.split('=')[1] ?? '2';
  const chapterId = process.argv.find((a) => a.startsWith('--chapter-id='))?.split('=')[1];
  const replace = process.argv.includes('--replace');
  return { page, chapterId, replace };
}

async function main() {
  const { page, chapterId: argChapterId, replace } = parseArgs();
  const filePath = join(UPLOAD_DIR, `${page}.jpg`);
  if (!existsSync(filePath)) throw new Error(`Missing ${filePath}`);

  const token = await login();
  const chapterId = await ensureTestChapter(token, argChapterId);

  let replaceSourceId: string | undefined;
  if (replace) {
    const lesson = await apiJson<Lesson>(`/lessons/${chapterId}`, token);
    const sources = lesson.pageSources ?? [];
    const hit = sources.find((s) => s.label === `${page}.jpg` || s.label === `Page ${page}`);
    if (hit) replaceSourceId = hit.id;
    else if (sources.length >= Number(page) - 1) {
      replaceSourceId = sources[Number(page) - 2]?.id;
    }
  }

  await uploadPage(token, chapterId, filePath, replaceSourceId);

  const lesson = await apiJson<Lesson>(`/lessons/${chapterId}`, token);
  const sources = lesson.pageSources ?? [];
  const target =
    sources.find((s) => s.label?.includes(`${page}.jpg`)) ??
    sources.sort((a, b) => a.pageOrder - b.pageOrder)[Number(page) - 2] ??
    sources[sources.length - 1];

  if (!target) throw new Error('No page source after upload');

  const report = {
    at: new Date().toISOString(),
    apiBase: BASE,
    chapterId,
    page,
    sourceId: target.id,
    label: target.label,
    paddleOcrText: target.paddleOcrText ?? '',
    tesseractOcrText: target.tesseractOcrText ?? '',
    mergedOcrText: target.mergedOcrText ?? '',
    ocrText: target.fetchedText ?? '',
    replaced: Boolean(replaceSourceId),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `prod-page-${page}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(
    JSON.stringify({
      ok: true,
      chapterId,
      sourceId: target.id,
      page,
      outPath,
      paddleChars: report.paddleOcrText.length,
      tesseractChars: report.tesseractOcrText.length,
      mergedChars: report.mergedOcrText.length,
      ocrChars: report.ocrText.length,
    }),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
