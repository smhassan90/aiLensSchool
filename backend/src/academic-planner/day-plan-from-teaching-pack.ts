import { LessonStage, PlannerLessonKind } from '@prisma/client';
import { randomUUID } from 'crypto';
import { fixLibraryTextEncoding } from '../library-books/fix-library-text-encoding';
import type { TeachingPackForAnalysis } from '../library-books/chapter-teaching-pack-to-analysis';
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
  exerciseLessonNotes,
  formatSavedActivityNotes,
  formatUnavailableChapterNotes,
  introLessonNotes,
  readingLessonNotes,
  selectSavedActivity,
  slicesForReadingDay,
} from './saved-activity-plan';
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
  if (!ordered.length) return null;
  const periodMinutes = input.settings.fallbackPeriodMinutes ?? 40;
  const keyFactory = input.keyFactory ?? (() => `lesson-${randomUUID().slice(0, 8)}`);

  const resolved = ordered.map((chapter) => resolveChapterPack(chapter, input.packsByChapterId));

  const revCount = defaultRevisionSlots(input.teachingSlots.length, input.settings.revisionSlots);
  const teachingSlotList = input.teachingSlots.slice(0, Math.max(0, input.teachingSlots.length - revCount));
  const revisionSlotList = input.teachingSlots.slice(Math.max(0, input.teachingSlots.length - revCount));

  const weights = resolved.map(({ chapter, pack }) => {
    const text =
      (chapter.libraryBookChapterId
        ? input.chapterTextsByLibraryId.get(chapter.libraryBookChapterId)
        : undefined) ??
      chapter.chapterText ??
      '';
    return chapterContentWeight(text, pack?.summary ?? '', pack?.readingSlices.length ?? 0);
  });

  const teachSlotBudget = Math.max(ordered.length, teachingSlotList.length);
  const teachDaysPerChapter = allocateTeachingDaysPerChapter(weights, teachSlotBudget, 0);

  type Draft = Omit<
    ScheduleLessonDraft,
    'scheduledDate' | 'periodNumber' | 'slotStartTime' | 'slotEndTime'
  > & { notes: string };

  const drafts: Draft[] = [];
  let globalDay = 0;

  resolved.forEach(({ chapter, pack, reason }, chapterIdx) => {
    const chapterTitle = displayChapterTitle(chapter.titleSnapshot);
    const teachDays = teachDaysPerChapter[chapterIdx] ?? 1;
    const roles = rolesForChapterDays(teachDays);
    const readingDayCount = roles.filter((role) => role === 'READING' || role === 'CONTINUE_READING').length;
    const exerciseDayCount = roles.filter((role) => role === 'EXERCISE').length;
    let readingPass = 0;
    let exercisePass = 0;
    const coveredSliceKeys: string[] = [];
    const usedActivityTitles: string[] = [];

    roles.forEach((role, roleIdx) => {
      globalDay++;
      let sectionHint: string | undefined;
      let teacherNotes = reason ? formatUnavailableChapterNotes(chapterTitle, reason, role) : '';
      let objectives: string[] | undefined;
      let titleSuffix: string | undefined;

      if (pack && role === 'INTRO') {
        if (pack.readingSlices[0]) coveredSliceKeys.push(pack.readingSlices[0].sliceKey);
        teacherNotes = introLessonNotes(chapterTitle, pack.readingSlices, pack.teacherGuide);
        objectives = [`Introduce ${chapterTitle}.`];
      }
      if (pack && (role === 'READING' || role === 'CONTINUE_READING')) {
        const window = slicesForReadingDay(pack.readingSlices, readingPass, readingDayCount);
        const daySlices = window.length
          ? window
          : pack.readingSlices.slice(-1);
        const hint = labelForTeachingDay(pack, readingPass, Math.max(readingDayCount, 1));
        readingPass++;
        for (const slice of daySlices) {
          if (!coveredSliceKeys.includes(slice.sliceKey)) coveredSliceKeys.push(slice.sliceKey);
        }
        if (hint && !isLowValueContent(hint) && !/^section \d+$/i.test(hint)) sectionHint = hint;
        teacherNotes = readingLessonNotes(daySlices, pack.teacherGuide);
        const sectionName = daySlices.map((slice) => slice.title).join(', ') || chapterTitle;
        objectives = [
          role === 'CONTINUE_READING'
            ? `Continue reading ${sectionName}.`
            : `Read ${sectionName} with the class.`,
        ];
      }
      if (pack && role === 'EXERCISE') {
        const pool = pack.questions.filter(
          (question) => !question.sliceKey || coveredSliceKeys.includes(question.sliceKey),
        );
        const questions = pool.length ? pool : pack.questions;
        const perDay = Math.max(1, Math.ceil(questions.length / Math.max(exerciseDayCount, 1)));
        const dayQuestions = questions.slice(exercisePass * perDay, exercisePass * perDay + perDay);
        exercisePass++;
        const sectionTitle = dayQuestions[0]?.sliceKey
          ? pack.readingSlices.find((slice) => slice.sliceKey === dayQuestions[0]?.sliceKey)?.title
          : undefined;
        teacherNotes = exerciseLessonNotes(chapterTitle, dayQuestions, sectionTitle);
        objectives = [`Do the textbook exercises for ${sectionTitle || chapterTitle}.`];
      }
      if (role === 'ACTIVITY') {
        const selected = pack
          ? selectSavedActivity({
              activities: pack.activities,
              coveredSliceKeys,
              usedTitles: usedActivityTitles,
              preferRecap: true,
            })
          : null;
        if (selected && pack) {
          usedActivityTitles.push(selected.title);
          teacherNotes = formatSavedActivityNotes(selected, chapterTitle, pack.activities, periodMinutes);
          objectives = [selected.title];
          titleSuffix = selected.title.slice(0, 80);
        } else if (!teacherNotes) {
          teacherNotes = formatUnavailableChapterNotes(
            chapterTitle,
            'No saved activity matches the sections already taught.',
            role,
          );
        }
      }

      const plan = buildMinimalDayPlan({
        chapterTitle,
        role,
        sectionHint,
        teacherNotes,
        objectives,
        titleSuffix,
      });
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

  const allRevisionPoints = resolved.flatMap(({ pack, chapter }) => {
    if (!pack) return [`Review ${displayChapterTitle(chapter.titleSnapshot)} from the textbook.`];
    return pack.revisionPoints.map((point) => fixLibraryTextEncoding(point.point));
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
  for (const { chapter, reason } of resolved) {
    if (!reason) continue;
    summary.warnings.push({
      code: 'TEACHING_PACK_UNAVAILABLE',
      message: `${displayChapterTitle(chapter.titleSnapshot)}: ${reason}`,
    });
  }
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
  activityFormatIndex?: number;
}): Pick<ScheduleLessonDraft, 'title' | 'objectives' | 'primaryStage' | 'stages' | 'plannedMinutes' | 'kind'> & {
  notes: string;
} {
  const tag = input.portionKeys[0] ?? '';
  const role =
    parseRoleFromPortionKey(tag) ??
    (input.kind === PlannerLessonKind.ACTIVITY ? 'ACTIVITY' : tag.startsWith('chapter-day:0') ? 'INTRO' : 'READING');
  const chapterTitle = displayChapterTitle(input.chapterTitle);
  const covered = input.pack.readingSlices.map((slice) => slice.sliceKey);
  let teacherNotes = '';
  let objectives: string[] | undefined;
  let titleSuffix: string | undefined;
  if (role === 'ACTIVITY') {
    const selected = selectSavedActivity({
      activities: input.pack.activities,
      coveredSliceKeys: covered,
      usedTitles: [],
      preferRecap: true,
    });
    if (selected) {
      teacherNotes = formatSavedActivityNotes(selected, chapterTitle, input.pack.activities, input.periodMinutes);
      objectives = [selected.title];
      titleSuffix = selected.title.slice(0, 80);
    } else {
      teacherNotes = formatUnavailableChapterNotes(
        chapterTitle,
        'No saved activity matches the sections already taught.',
        role,
      );
    }
  } else if (role === 'EXERCISE') {
    teacherNotes = exerciseLessonNotes(chapterTitle, input.pack.questions);
    objectives = [`Do the textbook exercises for ${chapterTitle}.`];
  } else if (role === 'INTRO') {
    teacherNotes = introLessonNotes(chapterTitle, input.pack.readingSlices, input.pack.teacherGuide);
    objectives = [`Introduce ${chapterTitle}.`];
  } else {
    const slices = input.pack.readingSlices.slice(0, 1);
    teacherNotes = readingLessonNotes(slices, input.pack.teacherGuide);
    objectives = [`Read ${slices[0]?.title || chapterTitle} with the class.`];
  }
  const plan = buildMinimalDayPlan({
    chapterTitle,
    role,
    teacherNotes,
    objectives,
    titleSuffix,
  });
  return {
    kind: plan.kind,
    title: `${input.dayLabel} — ${chapterTitle} · ${plan.titleSuffix}`,
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
    notes: plan.teacherNotes ?? '',
  };
}

function resolveChapterPack(
  chapter: PlannerChapterForDayPlan,
  packsByChapterId: Map<string, TeachingPackForAnalysis>,
): { chapter: PlannerChapterForDayPlan; pack: TeachingPackForAnalysis | null; reason: string | null } {
  if (!chapter.libraryBookChapterId) {
    return {
      chapter,
      pack: null,
      reason: 'This chapter is not linked to a library chapter.',
    };
  }
  if (!chapter.contentHash) {
    return {
      chapter,
      pack: null,
      reason: 'This chapter has no content hash, so its teaching pack cannot be checked.',
    };
  }
  const pack = packsByChapterId.get(chapter.libraryBookChapterId) ?? null;
  if (!pack) {
    return {
      chapter,
      pack: null,
      reason: 'No teaching pack is saved for this chapter. Generate the teaching pack before using its activities.',
    };
  }
  if (pack.contentHash !== chapter.contentHash) {
    return {
      chapter,
      pack: null,
      reason:
        'The saved teaching pack is out of date because the chapter text changed. It was not used. Regenerate the teaching pack.',
    };
  }
  return { chapter, pack, reason: null };
}
