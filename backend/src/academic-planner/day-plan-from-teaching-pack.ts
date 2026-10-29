import { LessonStage, PlannerLessonKind } from '@prisma/client';
import { randomUUID } from 'crypto';
import { fixLibraryTextEncoding } from '../library-books/fix-library-text-encoding';
import { TeachingPackForAnalysis } from '../library-books/chapter-teaching-pack-to-analysis';
import { allocateTeachingDaysPerChapter } from './day-plan-allocate';
import { displayChapterTitle } from './day-plan-content-quality';
import {
  buildMinimalDayPlan,
  parseRoleFromPortionKey,
  rolePortionKey,
  rolesForChapterDays,
} from './day-plan-chapter-roles';
import {
  chapterContentWeight,
  isLowValueContent,
  labelForTeachingDay,
} from './day-plan-teacher-script';
import {
  computeScheduleSummary,
  defaultRevisionSlots,
} from './schedule-engine';
import { PlannerSettings, ScheduleLessonDraft, ScheduleSummary, TeachingSlot } from './planner-types';

export type PlannerChapterForDayPlan = {
  chapterKey: string;
  titleSnapshot: string;
  libraryBookChapterId: string | null;
  contentHash: string | null;
  sortOrder: number;
  chapterText?: string;
};

export function generateDayPlanFromTeachingPacks(input: {
  chapters: PlannerChapterForDayPlan[];
  packsByChapterId: Map<string, TeachingPackForAnalysis>;
  chapterTextsByLibraryId: Map<string, string>;
  subjectName: string;
  teachingSlots: TeachingSlot[];
  settings: PlannerSettings;
  timetableSource: ScheduleSummary['timetableSource'];
  keyFactory?: () => string;
}): { lessons: ScheduleLessonDraft[]; summary: ScheduleSummary } | null {
  const ordered = [...input.chapters].sort((a, b) => a.sortOrder - b.sortOrder);
  const periodMinutes = input.settings.fallbackPeriodMinutes ?? 40;
  const keyFactory = input.keyFactory ?? (() => `lesson-${randomUUID().slice(0, 8)}`);

  for (const ch of ordered) {
    if (!ch.libraryBookChapterId || !ch.contentHash) return null;
    const pack = input.packsByChapterId.get(ch.libraryBookChapterId);
    if (!pack || pack.contentHash !== ch.contentHash) return null;
  }

  const revCount = defaultRevisionSlots(input.teachingSlots.length, input.settings.revisionSlots);
  const teachingSlotList = input.teachingSlots.slice(0, Math.max(0, input.teachingSlots.length - revCount));
  const revisionSlotList = input.teachingSlots.slice(Math.max(0, input.teachingSlots.length - revCount));

  const weights = ordered.map((ch) => {
    const pack = input.packsByChapterId.get(ch.libraryBookChapterId!)!;
    const text = input.chapterTextsByLibraryId.get(ch.libraryBookChapterId!) ?? ch.chapterText ?? '';
    return chapterContentWeight(text, pack.summary, pack.readingSlices.length);
  });

  const teachSlotBudget = Math.max(ordered.length, teachingSlotList.length);
  const teachDaysPerChapter = allocateTeachingDaysPerChapter(weights, teachSlotBudget, 0);

  type Draft = Omit<
    ScheduleLessonDraft,
    'scheduledDate' | 'periodNumber' | 'slotStartTime' | 'slotEndTime'
  > & { notes: string };

  const drafts: Draft[] = [];
  let globalDay = 0;

  ordered.forEach((chapter, chapterIdx) => {
    const libId = chapter.libraryBookChapterId!;
    const pack = input.packsByChapterId.get(libId)!;
    const chapterTitle = displayChapterTitle(chapter.titleSnapshot);
    const teachDays = teachDaysPerChapter[chapterIdx] ?? 1;
    const roles = rolesForChapterDays(teachDays);
    let readingPass = 0;

    roles.forEach((role, roleIdx) => {
      globalDay++;
      let sectionHint: string | undefined;
      if (role === 'READING' || role === 'CONTINUE_READING') {
        const hint = labelForTeachingDay(pack, readingPass, Math.max(roles.filter((r) => r === 'READING' || r === 'CONTINUE_READING').length, 1));
        readingPass++;
        if (hint && !isLowValueContent(hint) && !/^section \d+$/i.test(hint)) {
          sectionHint = hint;
        }
      }

      const plan = buildMinimalDayPlan({ chapterTitle, role, sectionHint });
      const stages =
        role === 'INTRO'
          ? [
              { stage: LessonStage.INTRODUCTION, minutes: Math.min(10, periodMinutes) },
              { stage: LessonStage.READING, minutes: Math.max(10, periodMinutes - 10) },
            ]
          : role === 'EXERCISE'
            ? [{ stage: LessonStage.GUIDED_PRACTICE, minutes: periodMinutes }]
            : role === 'ACTIVITY'
              ? [{ stage: LessonStage.ACTIVITY, minutes: periodMinutes }]
              : [{ stage: LessonStage.READING, minutes: periodMinutes }];

      drafts.push({
        lessonKey: keyFactory(),
        chapterKey: chapter.chapterKey,
        sequence: drafts.length,
        kind: plan.kind,
        title: `Day ${globalDay} — ${chapterTitle} · ${plan.titleSuffix}`,
        primaryStage: plan.primaryStage,
        stages,
        objectives: plan.objectives,
        portionKeys: [rolePortionKey(role, roleIdx)],
        dependsOnKeys: [],
        plannedMinutes: periodMinutes,
        frozen: false,
        isContinuation: roleIdx > 0 && role !== 'INTRO',
        notes: plan.teacherNotes ?? '',
      });
    });
  });

  const lessons: ScheduleLessonDraft[] = [];
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
    const pack = input.packsByChapterId.get(ch.libraryBookChapterId!)!;
    return pack.revisionPoints.map((r) => fixLibraryTextEncoding(r.point));
  });

  let ri = 0;
  for (const slot of revisionSlotList) {
    globalDay++;
    const point =
      allRevisionPoints[ri % Math.max(1, allRevisionPoints.length)] ??
      'Review what you taught this week in simple words.';
    ri++;
    lessons.push({
      lessonKey: keyFactory(),
      chapterKey: ordered[ordered.length - 1]?.chapterKey ?? null,
      sequence: lessons.length,
      kind: PlannerLessonKind.REVISION,
      title: `Day ${globalDay} — Revision`,
      primaryStage: LessonStage.REVISION,
      stages: [{ stage: LessonStage.REVISION, minutes: slot.minutes }],
      objectives: [`Quick revision: ${point}`],
      portionKeys: ['revision'],
      dependsOnKeys: [],
      plannedMinutes: slot.minutes,
      scheduledDate: slot.date,
      periodNumber: slot.periodNumber,
      slotStartTime: slot.startTime,
      slotEndTime: slot.endTime,
      frozen: false,
      isContinuation: false,
      notes: `Ask students to recall main points. ${point}`,
    });
  }

  lessons.forEach((l, idx) => {
    l.sequence = idx;
  });

  const summary = computeScheduleSummary(
    input.teachingSlots,
    revCount,
    lessons,
    [],
    input.timetableSource,
  );
  summary.warnings.push({
    code: 'DAY_PLAN_FROM_TEACHING_PACK',
    message:
      'Day-by-day plan: working days split across selected chapters; each chapter is taught in order before moving to the next.',
  });
  if (unscheduled > 0) {
    summary.warnings.push({
      code: 'DAY_PLAN_OVERFLOW',
      message: `${unscheduled} day(s) could not fit before the exam — add more time or fewer chapters.`,
    });
    summary.feasibility = 'AT_RISK';
  }

  return { lessons, summary };
}

export function rebuildLessonFromPack(input: {
  pack: TeachingPackForAnalysis;
  chapterTitle: string;
  chapterText?: string;
  subjectName: string;
  portionKeys: string[];
  kind: PlannerLessonKind;
  periodMinutes: number;
  dayLabel: string;
}): Pick<ScheduleLessonDraft, 'title' | 'objectives' | 'primaryStage' | 'stages' | 'plannedMinutes' | 'kind'> & {
  notes: string;
} {
  const tag = input.portionKeys[0] ?? '';
  const role =
    parseRoleFromPortionKey(tag) ??
    (input.kind === PlannerLessonKind.ACTIVITY ? 'ACTIVITY' : tag.startsWith('chapter-day:0') ? 'INTRO' : 'READING');
  const plan = buildMinimalDayPlan({
    chapterTitle: displayChapterTitle(input.chapterTitle),
    role,
  });
  return {
    kind: plan.kind,
    title: `${input.dayLabel} — ${displayChapterTitle(input.chapterTitle)} · ${plan.titleSuffix}`,
    primaryStage: plan.primaryStage,
    stages:
      role === 'ACTIVITY'
        ? [{ stage: LessonStage.ACTIVITY, minutes: input.periodMinutes }]
        : role === 'EXERCISE'
          ? [{ stage: LessonStage.GUIDED_PRACTICE, minutes: input.periodMinutes }]
          : role === 'INTRO'
            ? [
                { stage: LessonStage.INTRODUCTION, minutes: 8 },
                { stage: LessonStage.READING, minutes: Math.max(12, input.periodMinutes - 8) },
              ]
            : [{ stage: LessonStage.READING, minutes: input.periodMinutes }],
    objectives: plan.objectives,
    plannedMinutes: input.periodMinutes,
    notes: '',
  };
}
