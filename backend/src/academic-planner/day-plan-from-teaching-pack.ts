import { LessonStage, PlannerLessonKind } from '@prisma/client';
import { randomUUID } from 'crypto';
import { fixLibraryTextEncoding } from '../library-books/fix-library-text-encoding';
import { TeachingPackForAnalysis } from '../library-books/chapter-teaching-pack-to-analysis';
import {
  computeScheduleSummary,
  defaultRevisionSlots,
} from './schedule-engine';
import { PlannerSettings, ScheduleLessonDraft, ScheduleSummary, TeachingSlot } from './planner-types';

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

function sliceKeyToPortionKey(sliceKey: string): string {
  return `p${sliceKey.replace(/^s/i, '') || '1'}`;
}

function buildTeacherScript(input: {
  sliceTitle: string;
  readingFrom: string;
  readingTo: string | null;
  explainPoints: string[];
  chapterSummary: string;
}): string {
  const lines = [
    `Focus: ${input.sliceTitle}`,
    '',
    'Read with the class:',
    input.readingFrom,
  ];
  if (input.readingTo?.trim()) {
    lines.push(`…through: ${input.readingTo.trim()}`);
  }
  if (input.explainPoints.length) {
    lines.push('', 'Explain and check understanding:');
    for (const p of input.explainPoints.slice(0, 8)) {
      lines.push(`• ${p}`);
    }
  }
  lines.push('', input.chapterSummary.slice(0, 400));
  return lines.join('\n').slice(0, 4000);
}

export type PlannerChapterForDayPlan = {
  chapterKey: string;
  titleSnapshot: string;
  libraryBookChapterId: string | null;
  contentHash: string | null;
  sortOrder: number;
};

export function generateDayPlanFromTeachingPacks(input: {
  chapters: PlannerChapterForDayPlan[];
  packsByChapterId: Map<string, TeachingPackForAnalysis>;
  teachingSlots: TeachingSlot[];
  settings: PlannerSettings;
  timetableSource: ScheduleSummary['timetableSource'];
  keyFactory?: () => string;
}): { lessons: ScheduleLessonDraft[]; summary: ScheduleSummary } | null {
  const ordered = [...input.chapters].sort((a, b) => a.sortOrder - b.sortOrder);
  const periodMinutes = input.settings.fallbackPeriodMinutes ?? 40;
  const keyFactory = input.keyFactory ?? (() => `lesson-${randomUUID().slice(0, 8)}`);

  const drafts: Array<Omit<ScheduleLessonDraft, 'scheduledDate' | 'periodNumber' | 'slotStartTime' | 'slotEndTime'> & { notes: string }> = [];
  let dayIndex = 0;

  for (const chapter of ordered) {
    const libId = chapter.libraryBookChapterId;
    if (!libId || !chapter.contentHash) return null;
    const pack = input.packsByChapterId.get(libId);
    if (!pack || pack.contentHash !== chapter.contentHash) return null;

    const chapterTitle = fixLibraryTextEncoding(chapter.titleSnapshot);

    for (const slice of pack.readingSlices) {
      dayIndex++;
      const explainPoints = asStringArray(slice.explainPoints);
      const sliceTitle = fixLibraryTextEncoding(slice.title);
      drafts.push({
        lessonKey: keyFactory(),
        chapterKey: chapter.chapterKey,
        sequence: drafts.length,
        kind: PlannerLessonKind.TEACHING,
        title: `Day ${dayIndex} — ${sliceTitle}`,
        primaryStage: LessonStage.EXPLANATION,
        stages: [
          { stage: LessonStage.INTRODUCTION, minutes: Math.min(10, periodMinutes) },
          { stage: LessonStage.READING, minutes: Math.min(15, periodMinutes) },
          { stage: LessonStage.EXPLANATION, minutes: Math.max(10, periodMinutes - 25) },
        ],
        objectives: explainPoints.length
          ? explainPoints.slice(0, 8)
          : [`Teach ${sliceTitle} from ${chapterTitle}`],
        portionKeys: [`slice:${slice.sliceKey}`],
        dependsOnKeys: [],
        plannedMinutes: periodMinutes,
        frozen: false,
        isContinuation: false,
        notes: buildTeacherScript({
          sliceTitle,
          readingFrom: fixLibraryTextEncoding(slice.readingFrom),
          readingTo: slice.readingTo ? fixLibraryTextEncoding(slice.readingTo) : null,
          explainPoints,
          chapterSummary: fixLibraryTextEncoding(pack.summary),
        }),
      });
    }

    if (pack.activities.length > 0) {
      const act = pack.activities[0];
      dayIndex++;
      drafts.push({
        lessonKey: keyFactory(),
        chapterKey: chapter.chapterKey,
        sequence: drafts.length,
        kind: PlannerLessonKind.ACTIVITY,
        title: `Day ${dayIndex} — Activity: ${fixLibraryTextEncoding(act.title)}`,
        primaryStage: LessonStage.ACTIVITY,
        stages: [{ stage: LessonStage.ACTIVITY, minutes: periodMinutes }],
        objectives: [
          fixLibraryTextEncoding(act.description).slice(0, 300),
          `Participation: ${fixLibraryTextEncoding(act.participationTechnique).slice(0, 200)}`,
        ],
        portionKeys: ['activity:0'],
        dependsOnKeys: [],
        plannedMinutes: periodMinutes,
        frozen: false,
        isContinuation: false,
        notes: [
          fixLibraryTextEncoding(act.description),
          '',
          'How to run it:',
          fixLibraryTextEncoding(act.participationTechnique),
        ].join('\n'),
      });
    }
  }

  const revCount = defaultRevisionSlots(input.teachingSlots.length, input.settings.revisionSlots);
  const teachingSlotList = input.teachingSlots.slice(0, Math.max(0, input.teachingSlots.length - revCount));
  const revisionSlotList = input.teachingSlots.slice(Math.max(0, input.teachingSlots.length - revCount));

  const lessons: ScheduleLessonDraft[] = [];
  const overflow: never[] = [];

  for (let i = 0; i < drafts.length; i++) {
    const slot = teachingSlotList[i];
    const d = drafts[i];
    lessons.push({
      ...d,
      scheduledDate: slot?.date ?? null,
      periodNumber: slot?.periodNumber ?? null,
      slotStartTime: slot?.startTime ?? null,
      slotEndTime: slot?.endTime ?? null,
    });
  }

  const unscheduled = Math.max(0, drafts.length - teachingSlotList.length);

  const allRevisionPoints = ordered.flatMap((ch) => {
    const pack = ch.libraryBookChapterId ? input.packsByChapterId.get(ch.libraryBookChapterId) : null;
    return pack?.revisionPoints.map((r) => fixLibraryTextEncoding(r.point)) ?? [];
  });

  let ri = 0;
  for (const slot of revisionSlotList) {
    dayIndex++;
    const point = allRevisionPoints[ri % Math.max(1, allRevisionPoints.length)] ?? 'Review key ideas from recent chapters';
    ri++;
    lessons.push({
      lessonKey: keyFactory(),
      chapterKey: ordered[ordered.length - 1]?.chapterKey ?? null,
      sequence: lessons.length,
      kind: PlannerLessonKind.REVISION,
      title: `Day ${dayIndex} — Revision`,
      primaryStage: LessonStage.REVISION,
      stages: [{ stage: LessonStage.REVISION, minutes: slot.minutes }],
      objectives: [point],
      portionKeys: ['revision'],
      dependsOnKeys: [],
      plannedMinutes: slot.minutes,
      scheduledDate: slot.date,
      periodNumber: slot.periodNumber,
      slotStartTime: slot.startTime,
      slotEndTime: slot.endTime,
      frozen: false,
      isContinuation: false,
      notes: point,
    });
  }

  lessons.sort((a, b) => a.sequence - b.sequence);
  lessons.forEach((l, idx) => {
    l.sequence = idx;
  });

  const summary = computeScheduleSummary(
    input.teachingSlots,
    revCount,
    lessons,
    overflow,
    input.timetableSource,
  );
  summary.warnings.push({
    code: 'DAY_PLAN_FROM_TEACHING_PACK',
    message: 'Day-by-day plan built from library teaching packs (one day per section + activity day per chapter).',
  });
  if (unscheduled > 0) {
    summary.warnings.push({
      code: 'DAY_PLAN_OVERFLOW',
      message: `${unscheduled} day(s) could not be scheduled before the exam; extend the date range or reduce chapters.`,
    });
    summary.feasibility = 'AT_RISK';
  }

  return { lessons, summary };
}

export function rebuildLessonFromPack(input: {
  pack: TeachingPackForAnalysis;
  chapterTitle: string;
  portionKeys: string[];
  kind: PlannerLessonKind;
  periodMinutes: number;
  dayLabel: string;
}): Pick<ScheduleLessonDraft, 'title' | 'objectives' | 'primaryStage' | 'stages' | 'plannedMinutes' | 'kind'> & {
  notes: string;
} {
  const tag = input.portionKeys[0] ?? '';
  if (tag.startsWith('activity:')) {
    const idx = Number(tag.split(':')[1] ?? '0') || 0;
    const act = input.pack.activities[idx] ?? input.pack.activities[0];
    if (!act) {
      return {
        kind: PlannerLessonKind.ACTIVITY,
        title: `${input.dayLabel} — Activity`,
        primaryStage: LessonStage.ACTIVITY,
        stages: [{ stage: LessonStage.ACTIVITY, minutes: input.periodMinutes }],
        objectives: ['Run a class activity'],
        plannedMinutes: input.periodMinutes,
        notes: '',
      };
    }
    return {
      kind: PlannerLessonKind.ACTIVITY,
      title: `${input.dayLabel} — Activity: ${fixLibraryTextEncoding(act.title)}`,
      primaryStage: LessonStage.ACTIVITY,
      stages: [{ stage: LessonStage.ACTIVITY, minutes: input.periodMinutes }],
      objectives: [fixLibraryTextEncoding(act.description).slice(0, 300)],
      plannedMinutes: input.periodMinutes,
      notes: fixLibraryTextEncoding(act.participationTechnique),
    };
  }

  const sliceKey = tag.startsWith('slice:') ? tag.slice(6) : tag.replace(/^p/, 's');
  const slice = input.pack.readingSlices.find((s) => s.sliceKey === sliceKey) ?? input.pack.readingSlices[0];
  if (!slice) {
    return {
      kind: PlannerLessonKind.TEACHING,
      title: input.dayLabel,
      primaryStage: LessonStage.EXPLANATION,
      stages: [{ stage: LessonStage.EXPLANATION, minutes: input.periodMinutes }],
      objectives: [input.chapterTitle],
      plannedMinutes: input.periodMinutes,
      notes: fixLibraryTextEncoding(input.pack.summary),
    };
  }
  const explainPoints = asStringArray(slice.explainPoints);
  return {
    kind: PlannerLessonKind.TEACHING,
    title: `${input.dayLabel} — ${fixLibraryTextEncoding(slice.title)}`,
    primaryStage: LessonStage.EXPLANATION,
    stages: [
      { stage: LessonStage.INTRODUCTION, minutes: 10 },
      { stage: LessonStage.READING, minutes: 15 },
      { stage: LessonStage.EXPLANATION, minutes: Math.max(10, input.periodMinutes - 25) },
    ],
    objectives: explainPoints.slice(0, 8),
    plannedMinutes: input.periodMinutes,
    notes: buildTeacherScript({
      sliceTitle: fixLibraryTextEncoding(slice.title),
      readingFrom: fixLibraryTextEncoding(slice.readingFrom),
      readingTo: slice.readingTo ? fixLibraryTextEncoding(slice.readingTo) : null,
      explainPoints,
      chapterSummary: fixLibraryTextEncoding(input.pack.summary),
    }),
  };
}
