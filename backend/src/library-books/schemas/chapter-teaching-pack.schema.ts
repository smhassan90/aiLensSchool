import { z } from 'zod';
import { parseModelJson } from '../../ai/parse-model-json';

export const ChapterTeachingPackSchema = z.object({
  complexity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  summary: z.string().min(20).max(4000),
  teacherGuide: z.array(z.string().min(5).max(500)).min(1).max(40),
  readingSlices: z
    .array(
      z.object({
        sliceKey: z.string().regex(/^s\d{1,2}$/),
        title: z.string().min(2).max(160),
        readingFrom: z.string().min(8).max(800),
        readingTo: z.string().max(800).optional().nullable(),
        explainPoints: z.array(z.string().min(5).max(400)).min(1).max(12),
      }),
    )
    .min(1)
    .max(12),
  questions: z
    .array(
      z.object({
        sliceKey: z.string().regex(/^s\d{1,2}$/).nullable().optional(),
        question: z.string().min(5).max(600),
        expectedAnswer: z.string().min(2).max(1200),
        format: z.enum(['ORAL', 'WRITTEN', 'QUICK_FIRE']),
      }),
    )
    .min(1)
    .max(40),
  activities: z
    .array(
      z.object({
        sliceKey: z.string().regex(/^s\d{1,2}$/).nullable().optional(),
        title: z.string().min(2).max(160),
        learningObjective: z.string().min(10).max(400),
        description: z.string().min(10).max(1200),
        materials: z.string().min(2).max(300),
        steps: z.array(z.string().min(5).max(400)).min(2).max(8),
        participationTechnique: z.string().min(10).max(800),
        expectedOutcome: z.string().min(10).max(400),
        durationMinutes: z.number().int().min(5).max(40),
      }),
    )
    .min(3)
    .max(5),
  revisionPoints: z
    .array(
      z.object({
        sliceKey: z.string().regex(/^s\d{1,2}$/).nullable().optional(),
        point: z.string().min(5).max(400),
      }),
    )
    .min(1)
    .max(30),
});

export type ChapterTeachingPackOutput = z.infer<typeof ChapterTeachingPackSchema>;

function truncStr(value: unknown, max: number, min = 0): string | unknown {
  if (typeof value !== 'string') return value;
  let s = value.trim();
  if (s.length > max) {
    s = `${s.slice(0, Math.max(min, max - 1)).trimEnd()}…`;
  }
  if (min > 0 && s.length < min) {
    s = (s || 'Topic').slice(0, max).padEnd(min, '.');
  }
  return s.slice(0, max);
}

function truncStrings(v: unknown, max: number, min = 0): unknown {
  if (!Array.isArray(v)) return v;
  return v.map((item) => truncStr(item, max, min));
}

function genericSectionSummary(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false;
  const activity = item as Record<string, unknown>;
  const blob = `${activity.title ?? ''}\n${activity.description ?? ''}`.toLowerCase();
  return (
    /\bunit recap\b/.test(blob) ||
    /each group owns one section/.test(blob) ||
    (/section names on the board/.test(blob) && /real-life example/.test(blob))
  );
}

/** Keep at most five activities. Drop a generic unit recap before a chapter task. */
export function capTeachingPackActivities(activities: unknown): unknown {
  if (!Array.isArray(activities) || activities.length <= 5) return activities;
  const specific = activities.filter((item) => !genericSectionSummary(item));
  const source = specific.length >= 3 ? specific : activities;
  return source.slice(0, 5);
}

/** Trim AI overflow so Zod validation succeeds without dropping the whole pack. */
export function coerceChapterTeachingPack(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const r = raw as Record<string, unknown>;
  const cap = <T>(v: unknown, n: number): unknown => (Array.isArray(v) ? v.slice(0, n) : v);
  const slices = cap(r.readingSlices, 12);
  const normalizedSlices = Array.isArray(slices)
    ? slices.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const s = item as Record<string, unknown>;
        return {
          ...s,
          title: truncStr(s.title, 160, 2),
          readingFrom: truncStr(s.readingFrom, 800, 8),
          readingTo: s.readingTo == null ? s.readingTo : truncStr(s.readingTo, 800),
          explainPoints: truncStrings(cap(s.explainPoints, 12), 400, 5),
        };
      })
    : slices;
  const questions = cap(r.questions, 40);
  const normalizedQuestions = Array.isArray(questions)
    ? questions.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const q = item as Record<string, unknown>;
        return {
          ...q,
          question: truncStr(q.question, 600, 5),
          expectedAnswer: truncStr(q.expectedAnswer, 1200, 2),
        };
      })
    : questions;
  const activities = capTeachingPackActivities(r.activities);
  const normalizedActivities = Array.isArray(activities)
    ? activities.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const a = item as Record<string, unknown>;
        const duration =
          typeof a.durationMinutes === 'number' && Number.isFinite(a.durationMinutes)
            ? Math.min(40, Math.max(5, Math.round(a.durationMinutes)))
            : a.durationMinutes;
        return {
          ...a,
          title: truncStr(a.title, 160, 2),
          learningObjective:
            a.learningObjective == null ? a.learningObjective : truncStr(a.learningObjective, 400, 10),
          description: truncStr(a.description, 1200, 10),
          participationTechnique: truncStr(a.participationTechnique, 800, 10),
          materials:
            a.materials == null || String(a.materials).trim() === ''
              ? 'Textbook and notebooks'
              : truncStr(a.materials, 300, 2),
          expectedOutcome: a.expectedOutcome == null ? a.expectedOutcome : truncStr(a.expectedOutcome, 400, 10),
          steps: Array.isArray(a.steps) ? truncStrings(a.steps.slice(0, 8), 400, 5) : a.steps,
          durationMinutes: duration,
        };
      })
    : activities;
  const revisionPoints = cap(r.revisionPoints, 30);
  const normalizedRevision = Array.isArray(revisionPoints)
    ? revisionPoints.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const p = item as Record<string, unknown>;
        return { ...p, point: truncStr(p.point, 400, 5) };
      })
    : revisionPoints;
  return {
    ...r,
    summary: truncStr(r.summary, 4000, 20),
    teacherGuide: truncStrings(cap(r.teacherGuide, 40), 500, 5),
    readingSlices: normalizedSlices,
    questions: normalizedQuestions,
    activities: normalizedActivities,
    revisionPoints: normalizedRevision,
  };
}

export function parseChapterTeachingPackJson(text: string): ChapterTeachingPackOutput {
  return ChapterTeachingPackSchema.parse(coerceChapterTeachingPack(parseModelJson(text)));
}
