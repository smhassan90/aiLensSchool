import { LessonStage, PlannerLessonKind } from '@prisma/client';
import { randomUUID } from 'crypto';
import { fixLibraryTextEncoding } from '../library-books/fix-library-text-encoding';
import { TeachingPackForAnalysis } from '../library-books/chapter-teaching-pack-to-analysis';
import { allocateTeachingDaysPerChapter, splitParagraphsAcrossDays } from './day-plan-allocate';
import {
  buildChapterRecapActivity,
  buildExpertTeachingDayPlan,
  chapterContentWeight,
  explainPointsForDay,
  isLowValueContent,
  labelForTeachingDay,
  pickCheckQuestions,
} from './day-plan-teacher-script';
import {
  computeScheduleSummary,
  defaultRevisionSlots,
} from './schedule-engine';
import { PlannerSettings, ScheduleLessonDraft, ScheduleSummary, TeachingSlot } from './planner-types';

function packLooksIndexOnly(pack: TeachingPackForAnalysis): boolean {
  const blob = pack.readingSlices.map((s) => `${s.readingFrom} ${s.title}`).join(' ').toLowerCase();
  return (
    blob.includes('index') &&
    (blob.includes('page') || blob.includes('indexed')) &&
    pack.readingSlices.every((s) => s.readingFrom.length < 400)
  );
}

type ChapterPortion = {
  label: string;
  body: string;
  sliceKey?: string;
  explainPoints: string[];
  questions: string[];
};

function buildChapterPortions(
  pack: TeachingPackForAnalysis,
  chapterText: string,
  teachDays: number,
): ChapterPortion[] {
  const text = fixLibraryTextEncoding(chapterText).trim();
  const textUsable = text.length >= 120 && !isLowValueContent(text);
  const useText =
    textUsable && (packLooksIndexOnly(pack) || text.length > pack.summary.length * 1.2);

  const portionMeta = (dayIndex: number, sliceKey?: string): Pick<ChapterPortion, 'explainPoints' | 'questions'> => ({
    explainPoints: explainPointsForDay(pack, dayIndex, teachDays),
    questions: pickCheckQuestions(pack, sliceKey, 4),
  });

  if (useText) {
    const chunks = splitParagraphsAcrossDays(text, teachDays);
    return chunks.map((body, i) => ({
      label: labelForTeachingDay(pack, i, teachDays),
      body: isLowValueContent(body) ? '' : body,
      ...portionMeta(i),
    }));
  }

  const slices = pack.readingSlices;
  if (slices.length === 0 && textUsable) {
    return splitParagraphsAcrossDays(text, teachDays).map((body, i) => ({
      label: labelForTeachingDay(pack, i, teachDays),
      body: isLowValueContent(body) ? '' : body,
      ...portionMeta(i),
    }));
  }

  const groups: ChapterPortion[] = Array.from({ length: teachDays }, (_, i) => ({
    label: `Part ${i + 1}`,
    body: '',
    explainPoints: [] as string[],
    questions: [] as string[],
  }));

  const slicesPerDay = Math.max(1, Math.ceil(slices.length / teachDays));
  slices.forEach((slice, i) => {
    const g = Math.min(teachDays - 1, Math.floor(i / slicesPerDay));
    const title = fixLibraryTextEncoding(slice.title);
    const reading = fixLibraryTextEncoding(slice.readingFrom);
    if (groups[g].label === `Part ${g + 1}` && i === 0) {
      groups[g].label = title;
    } else if (!groups[g].label.includes(title)) {
      groups[g].label = groups[g].label === `Part ${g + 1}` ? title : `${groups[g].label} · ${title}`;
    }
    if (!isLowValueContent(reading)) {
      groups[g].body += (groups[g].body ? '\n\n' : '') + reading;
    }
    groups[g].sliceKey = slice.sliceKey;
  });

  return groups
    .map((g, dayIndex) => ({
      ...g,
      label: labelForTeachingDay(pack, dayIndex, teachDays) || g.label,
      ...portionMeta(dayIndex, g.sliceKey),
    }))
    .filter((g) => g.body.trim().length > 0 || g.explainPoints.length > 0);
}

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

  const activityDaysWanted = ordered.length;

  const teachSlotBudget = Math.max(ordered.length, teachingSlotList.length - activityDaysWanted);
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
    const chapterTitle = fixLibraryTextEncoding(chapter.titleSnapshot);
    const chapterText = input.chapterTextsByLibraryId.get(libId) ?? chapter.chapterText ?? '';
    const teachDays = teachDaysPerChapter[chapterIdx] ?? 1;
    const portions = buildChapterPortions(pack, chapterText, teachDays);

    portions.forEach((portion, dayInChapter) => {
      globalDay++;
      const { objectives, teacherNotes } = buildExpertTeachingDayPlan({
        chapterTitle,
        subjectName: input.subjectName,
        dayInChapter: dayInChapter + 1,
        totalDaysInChapter: portions.length,
        portionText: portion.body,
        portionLabel: portion.label,
        isFirstDayOfChapter: dayInChapter === 0,
        explainPoints: portion.explainPoints,
        questions: portion.questions,
        packSummary: pack.summary,
      });

      drafts.push({
        lessonKey: keyFactory(),
        chapterKey: chapter.chapterKey,
        sequence: drafts.length,
        kind: PlannerLessonKind.TEACHING,
        title:
          portions.length > 1
            ? `Day ${globalDay} — ${chapterTitle} · ${portion.label}`
            : `Day ${globalDay} — ${chapterTitle}`,
        primaryStage:
          dayInChapter === 0 ? LessonStage.INTRODUCTION : LessonStage.EXPLANATION,
        stages: [
          { stage: LessonStage.INTRODUCTION, minutes: Math.min(8, periodMinutes) },
          { stage: LessonStage.READING, minutes: Math.min(14, periodMinutes) },
          { stage: LessonStage.EXPLANATION, minutes: Math.max(12, periodMinutes - 22) },
        ],
        objectives,
        portionKeys: [
          portion.sliceKey ? `slice:${portion.sliceKey}` : `chapter-day:${dayInChapter}`,
        ],
        dependsOnKeys: [],
        plannedMinutes: periodMinutes,
        frozen: false,
        isContinuation: dayInChapter > 0,
        notes: teacherNotes,
      });
    });

    if (portions.length > 0) {
      const recap = buildChapterRecapActivity({
        chapterTitle,
        subjectName: input.subjectName,
        pack,
      });
      globalDay++;
      drafts.push({
        lessonKey: keyFactory(),
        chapterKey: chapter.chapterKey,
        sequence: drafts.length,
        kind: PlannerLessonKind.ACTIVITY,
        title: `Day ${globalDay} — Activity: ${recap.activityTitle}`,
        primaryStage: LessonStage.ACTIVITY,
        stages: [{ stage: LessonStage.ACTIVITY, minutes: periodMinutes }],
        objectives: recap.objectives,
        portionKeys: ['activity:0'],
        dependsOnKeys: [],
        plannedMinutes: periodMinutes,
        frozen: false,
        isContinuation: false,
        notes: recap.teacherNotes,
      });
    }
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
  if (tag.startsWith('activity:')) {
    const recap = buildChapterRecapActivity({
      chapterTitle: input.chapterTitle,
      subjectName: input.subjectName,
      pack: input.pack,
    });
    return {
      kind: PlannerLessonKind.ACTIVITY,
      title: `${input.dayLabel} — Activity: ${recap.activityTitle}`,
      primaryStage: LessonStage.ACTIVITY,
      stages: [{ stage: LessonStage.ACTIVITY, minutes: input.periodMinutes }],
      objectives: recap.objectives,
      plannedMinutes: input.periodMinutes,
      notes: recap.teacherNotes,
    };
  }

  if (tag.startsWith('chapter-day:')) {
    const dayIdx = Number(tag.split(':')[1] ?? '0') || 0;
    const text = input.chapterText ?? input.pack.summary;
    const chunks = splitParagraphsAcrossDays(text, Math.max(dayIdx + 1, 1));
    const body = chunks[dayIdx] ?? chunks[chunks.length - 1] ?? text;
    const teachDays = Math.max(chunks.length, dayIdx + 1);
    const { objectives, teacherNotes } = buildExpertTeachingDayPlan({
      chapterTitle: input.chapterTitle,
      subjectName: input.subjectName,
      dayInChapter: dayIdx + 1,
      totalDaysInChapter: teachDays,
      portionText: body,
      portionLabel: labelForTeachingDay(input.pack, dayIdx, teachDays),
      isFirstDayOfChapter: dayIdx === 0,
      explainPoints: explainPointsForDay(input.pack, dayIdx, teachDays),
      questions: pickCheckQuestions(input.pack, undefined, 4),
      packSummary: input.pack.summary,
    });
    return {
      kind: PlannerLessonKind.TEACHING,
      title: `${input.dayLabel} — ${fixLibraryTextEncoding(input.chapterTitle)}`,
      primaryStage: dayIdx === 0 ? LessonStage.INTRODUCTION : LessonStage.EXPLANATION,
      stages: [
        { stage: LessonStage.INTRODUCTION, minutes: 8 },
        { stage: LessonStage.READING, minutes: 14 },
        { stage: LessonStage.EXPLANATION, minutes: Math.max(12, input.periodMinutes - 22) },
      ],
      objectives,
      plannedMinutes: input.periodMinutes,
      notes: teacherNotes,
    };
  }

  const sliceKey = tag.startsWith('slice:') ? tag.slice(6) : tag.replace(/^p/, 's');
  const slice = input.pack.readingSlices.find((s) => s.sliceKey === sliceKey) ?? input.pack.readingSlices[0];
  const body = slice ? fixLibraryTextEncoding(slice.readingFrom) : input.pack.summary;
  const explainPoints = slice
    ? (Array.isArray(slice.explainPoints)
        ? (slice.explainPoints as string[]).filter((x) => typeof x === 'string')
        : [])
    : explainPointsForDay(input.pack, 0, 1);
  const { objectives, teacherNotes } = buildExpertTeachingDayPlan({
    chapterTitle: input.chapterTitle,
    subjectName: input.subjectName,
    dayInChapter: 1,
    totalDaysInChapter: 1,
    portionText: body,
    portionLabel: slice ? fixLibraryTextEncoding(slice.title) : 'Lesson',
    isFirstDayOfChapter: true,
    explainPoints,
    questions: pickCheckQuestions(input.pack, slice?.sliceKey, 4),
    packSummary: input.pack.summary,
  });
  return {
    kind: PlannerLessonKind.TEACHING,
    title: `${input.dayLabel} — ${slice ? fixLibraryTextEncoding(slice.title) : input.chapterTitle}`,
    primaryStage: LessonStage.EXPLANATION,
    stages: [
      { stage: LessonStage.INTRODUCTION, minutes: 8 },
      { stage: LessonStage.READING, minutes: 14 },
      { stage: LessonStage.EXPLANATION, minutes: Math.max(12, input.periodMinutes - 22) },
    ],
    objectives,
    plannedMinutes: input.periodMinutes,
    notes: teacherNotes,
  };
}
