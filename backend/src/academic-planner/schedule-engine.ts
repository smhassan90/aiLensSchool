import { LessonStage, PlannerLessonKind, TimetablePeriodKind, Weekday } from '@prisma/client';
import { dateFromIso, hmToMinutes } from '../teachers/teacher-checkin';
import {
  PackSegment,
  PlannerSettings,
  ScheduleLessonDraft,
  ScheduleSummary,
  TeachingSlot,
} from './planner-types';

export type BuildTeachingSlotsInput = {
  startDate: string;
  lastTeachingDate: string;
  sectionId: string;
  gradeHasPeriodTimetable: boolean;
  subjectId: string;
  workingDayFn: (dateIso: string) => { working: boolean; timetableWeekday: Weekday | null; reason: string | null };
  periodsForDate: (dateIso: string) => Array<{
    kind: TimetablePeriodKind | 'LESSON' | 'BREAK' | 'OTHER';
    periodNumber: number | null;
    subjectId: string | null;
    startTime: string | null;
    endTime: string | null;
  }>;
  fallback?: { periodsPerWeek: number; periodMinutes: number };
};

export type ChapterForSegments = {
  chapterKey: string;
  title: string;
  required: boolean;
  activitiesEnabled: boolean;
  analysis: {
    portions: Array<{
      portionKey: string;
      title: string;
      compressible: boolean;
      stages: Array<{ stage: LessonStage; minutes: number }>;
      dependsOn?: string[];
    }>;
    assessmentMinutes: number;
    objectives: string[];
  } | null;
  activities: Array<{
    activityKey: string;
    title: string;
    minutes: number;
    afterPortionKey: string | null;
    optional: boolean;
  }>;
};

export type PackOptions = {
  minChapterStartMinutes: number;
  fallbackMinutes: number;
  keyFactory?: () => string;
};

export type MoveTarget = { date: string; periodNumber: number };

function listIsoDates(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = dateFromIso(from);
  const end = dateFromIso(to);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function buildTeachingSlots(input: BuildTeachingSlotsInput): {
  slots: TeachingSlot[];
  timetableSource: ScheduleSummary['timetableSource'];
  warnings: ScheduleSummary['warnings'];
} {
  const warnings: ScheduleSummary['warnings'] = [];
  const slots: TeachingSlot[] = [];
  for (const date of listIsoDates(input.startDate, input.lastTeachingDate)) {
    const wd = input.workingDayFn(date);
    if (!wd.working || !wd.timetableWeekday) continue;
    if (!input.gradeHasPeriodTimetable) {
      slots.push({
        date,
        periodNumber: 0,
        minutes: input.fallback?.periodMinutes ?? 40,
        startTime: null,
        endTime: null,
      });
      continue;
    }
    const periods = input
      .periodsForDate(date)
      .filter((p) => {
        const kind = p.kind as string;
        return kind === TimetablePeriodKind.LESSON || kind === 'LESSON';
      })
      .filter((p) => p.subjectId === input.subjectId && p.startTime && p.endTime)
      .sort((a, b) => hmToMinutes(a.startTime!) - hmToMinutes(b.startTime!));
    for (const p of periods) {
      slots.push({
        date,
        periodNumber: p.periodNumber ?? 1,
        startTime: p.startTime,
        endTime: p.endTime,
        minutes: hmToMinutes(p.endTime!) - hmToMinutes(p.startTime!),
      });
    }
  }

  if (slots.length === 0 && input.gradeHasPeriodTimetable) {
    if (!input.fallback) {
      throw Object.assign(new Error('TIMETABLE_REQUIRED'), {
        code: 'TIMETABLE_REQUIRED',
        details: { sectionId: input.sectionId, subjectId: input.subjectId },
      });
    }
    warnings.push({ code: 'TIMETABLE_ASSUMED', message: 'Using teacher-provided fallback periods per week' });
    const weekdays = [Weekday.MONDAY, Weekday.TUESDAY, Weekday.WEDNESDAY, Weekday.THURSDAY, Weekday.FRIDAY];
    let i = 0;
    for (const date of listIsoDates(input.startDate, input.lastTeachingDate)) {
      const wd = input.workingDayFn(date);
      if (!wd.working || !wd.timetableWeekday) continue;
      const dayIndex = weekdays.indexOf(wd.timetableWeekday);
      if (dayIndex < 0) continue;
      if (dayIndex < input.fallback.periodsPerWeek) {
        slots.push({
          date,
          periodNumber: (i % input.fallback.periodsPerWeek) + 1,
          startTime: null,
          endTime: null,
          minutes: input.fallback.periodMinutes,
        });
        i++;
      }
    }
    return { slots, timetableSource: 'FALLBACK', warnings };
  }

  return { slots, timetableSource: slots.length ? 'LEGACY' : 'VERSIONED', warnings };
}

export function defaultRevisionSlots(slotCount: number, configured?: number): number {
  if (configured !== undefined && configured > 0) return configured;
  const raw = Math.round(slotCount * 0.1);
  return Math.min(6, Math.max(1, raw));
}

export function buildSegments(chapters: ChapterForSegments[]): PackSegment[] {
  const segments: PackSegment[] = [];
  for (const ch of chapters) {
    if (!ch.analysis) continue;
    for (const portion of ch.analysis.portions) {
      for (const st of portion.stages) {
        segments.push({
          chapterKey: ch.chapterKey,
          chapterTitle: ch.title,
          portionKey: portion.portionKey,
          portionTitle: portion.title,
          stage: st.stage,
          minutes: st.minutes,
          required: ch.required,
          compressible: portion.compressible,
          floorMinutes: portion.compressible ? Math.ceil(st.minutes * 0.7) : st.minutes,
        });
      }
      if (ch.activitiesEnabled) {
        for (const act of ch.activities.filter((a) => a.afterPortionKey === portion.portionKey)) {
          segments.push({
            chapterKey: ch.chapterKey,
            chapterTitle: ch.title,
            activityKey: act.activityKey,
            portionTitle: act.title,
            stage: LessonStage.ACTIVITY,
            minutes: act.minutes,
            required: false,
            compressible: true,
            floorMinutes: Math.ceil(act.minutes * 0.7),
            optional: act.optional,
          });
        }
      }
    }
    for (const act of ch.activities.filter((a) => !a.afterPortionKey)) {
      segments.push({
        chapterKey: ch.chapterKey,
        chapterTitle: ch.title,
        activityKey: act.activityKey,
        portionTitle: act.title,
        stage: LessonStage.ACTIVITY,
        minutes: act.minutes,
        required: false,
        compressible: true,
        floorMinutes: Math.ceil(act.minutes * 0.7),
        optional: act.optional,
      });
    }
    if (ch.analysis.assessmentMinutes > 0) {
      segments.push({
        chapterKey: ch.chapterKey,
        chapterTitle: ch.title,
        stage: LessonStage.ASSESSMENT,
        minutes: ch.analysis.assessmentMinutes,
        required: ch.required,
        compressible: false,
        floorMinutes: ch.analysis.assessmentMinutes,
      });
    }
  }
  return segments;
}

function slotKey(s: TeachingSlot): string {
  return `${s.date}|${s.periodNumber}`;
}

function newLessonDraft(slot: TeachingSlot, sequence: number, keyFactory: () => string): ScheduleLessonDraft {
  return {
    lessonKey: keyFactory(),
    chapterKey: null,
    sequence,
    kind: PlannerLessonKind.TEACHING,
    title: '',
    primaryStage: LessonStage.INTRODUCTION,
    stages: [],
    objectives: [],
    portionKeys: [],
    dependsOnKeys: [],
    plannedMinutes: 0,
    scheduledDate: slot.date,
    periodNumber: slot.periodNumber,
    slotStartTime: slot.startTime,
    slotEndTime: slot.endTime,
    frozen: false,
    isContinuation: false,
  };
}

function usedMinutes(lesson: ScheduleLessonDraft): number {
  return lesson.stages.reduce((s, x) => s + x.minutes, 0);
}

function closeLesson(lesson: ScheduleLessonDraft): void {
  if (lesson.stages.length === 0) return;
  lesson.plannedMinutes = usedMinutes(lesson);
  const byStage = [...lesson.stages].sort((a, b) => b.minutes - a.minutes);
  lesson.primaryStage = byStage[0]?.stage ?? LessonStage.INTRODUCTION;
  const activityOnly = lesson.stages.every((s) => s.stage === LessonStage.ACTIVITY);
  const hasAssessment = lesson.stages.some((s) => s.stage === LessonStage.ASSESSMENT);
  lesson.kind = hasAssessment
    ? PlannerLessonKind.ASSESSMENT
    : activityOnly
      ? PlannerLessonKind.ACTIVITY
      : PlannerLessonKind.TEACHING;
  lesson.portionKeys = [...new Set(lesson.stages.map((s) => s.portionKey).filter(Boolean) as string[])];
}

export function pack(
  segments: PackSegment[],
  teachingSlots: TeachingSlot[],
  revisionSlots: TeachingSlot[],
  frozenLessons: ScheduleLessonDraft[],
  opts: PackOptions,
): { lessons: ScheduleLessonDraft[]; overflow: PackSegment[] } {
  const keyFactory = opts.keyFactory ?? (() => `lesson-${Math.random().toString(36).slice(2, 10)}`);
  const occupied = new Set(frozenLessons.map((l) => `${l.scheduledDate}|${l.periodNumber}`));
  const lessons: ScheduleLessonDraft[] = [...frozenLessons];
  let cursor = 0;
  while (cursor < teachingSlots.length && occupied.has(slotKey(teachingSlots[cursor]))) cursor++;

  let sequence = lessons.length;
  let current: ScheduleLessonDraft | null =
    cursor < teachingSlots.length ? newLessonDraft(teachingSlots[cursor], sequence++, keyFactory) : null;
  const overflow: PackSegment[] = [];

  const advance = () => {
    if (current && current.stages.length > 0) {
      closeLesson(current);
      lessons.push(current);
    }
    current = null;
    do {
      cursor++;
    } while (cursor < teachingSlots.length && occupied.has(slotKey(teachingSlots[cursor])));
    if (cursor < teachingSlots.length) {
      current = newLessonDraft(teachingSlots[cursor], sequence++, keyFactory);
    }
  };

  for (const seg of segments) {
    let remaining = seg.minutes;
    while (remaining > 0) {
      if (!current || cursor >= teachingSlots.length) {
        overflow.push({ ...seg, minutes: remaining });
        break;
      }
      const slot = teachingSlots[cursor];
      const free = slot.minutes - usedMinutes(current);
      if (
        seg.portionKey &&
        usedMinutes(current) > 0 &&
        free < opts.minChapterStartMinutes &&
        free < remaining
      ) {
        advance();
        continue;
      }
      const take = Math.min(free, remaining);
      const partCount = Math.ceil(seg.minutes / take);
      current.chapterKey = seg.chapterKey;
      if (!current.title) {
        current.title = seg.portionTitle
          ? `${seg.chapterTitle}: ${seg.portionTitle}`
          : `${seg.chapterTitle}`;
      }
      current.stages.push({
        stage: seg.stage,
        minutes: take,
        portionKey: seg.portionKey,
        activityKey: seg.activityKey,
        part: 1,
        partCount,
      });
      remaining -= take;
      if (slot.minutes - usedMinutes(current) === 0) advance();
    }
  }
  if (current && current.stages.length > 0) {
    closeLesson(current);
    lessons.push(current);
  }

  // Revision lessons in reserved tail slots
  const teaching = lessons.filter((l) => l.kind !== PlannerLessonKind.REVISION);
  const chapterWeights = new Map<string, number>();
  for (const l of teaching) {
    if (!l.chapterKey) continue;
    chapterWeights.set(l.chapterKey, (chapterWeights.get(l.chapterKey) ?? 0) + l.plannedMinutes);
  }
  const chapterKeys = [...chapterWeights.keys()];
  let ri = 0;
  for (const slot of revisionSlots) {
    if (chapterKeys.length === 0) break;
    const chapterKey = chapterKeys[ri % chapterKeys.length];
    ri++;
    lessons.push({
      lessonKey: keyFactory(),
      chapterKey,
      sequence: sequence++,
      kind: PlannerLessonKind.REVISION,
      title: 'Revision',
      primaryStage: LessonStage.REVISION,
      stages: [{ stage: LessonStage.REVISION, minutes: slot.minutes }],
      objectives: [],
      portionKeys: [],
      dependsOnKeys: [],
      plannedMinutes: slot.minutes,
      scheduledDate: slot.date,
      periodNumber: slot.periodNumber,
      slotStartTime: slot.startTime,
      slotEndTime: slot.endTime,
      frozen: false,
      isContinuation: false,
    });
  }

  return { lessons, overflow };
}

export function computeScheduleSummary(
  teachingSlots: TeachingSlot[],
  revisionSlotCount: number,
  lessons: ScheduleLessonDraft[],
  overflow: PackSegment[],
  timetableSource: ScheduleSummary['timetableSource'],
): ScheduleSummary {
  const totalSlots = teachingSlots.length + revisionSlotCount;
  const teachingSlotsCount = Math.max(0, teachingSlots.length - revisionSlotCount);
  const revisionSlots = revisionSlotCount;
  const scheduled = lessons.filter((l) => l.scheduledDate);
  const usedSlots = scheduled.length;
  const slackSlots = Math.max(0, teachingSlotsCount - usedSlots);
  const capacityMinutes = teachingSlots.slice(0, teachingSlotsCount).reduce((s, x) => s + x.minutes, 0);
  const requiredMinutes = overflow.filter((o) => o.required).reduce((s, o) => s + o.minutes, 0);
  const shortfallMinutes = overflow.filter((o) => o.required).reduce((s, o) => s + o.minutes, 0);
  const unscheduledLessonCount = lessons.filter((l) => !l.scheduledDate).length;
  const hasRequiredOverflow = overflow.some((o) => o.required);
  let feasibility: ScheduleSummary['feasibility'] = 'FEASIBLE';
  if (hasRequiredOverflow) feasibility = 'INFEASIBLE';
  else if (slackSlots < 2) feasibility = 'AT_RISK';

  const lastRequired = [...lessons]
    .filter((l) => l.scheduledDate && l.kind !== PlannerLessonKind.REVISION)
    .sort((a, b) => (a.scheduledDate! > b.scheduledDate! ? 1 : -1))
    .pop();

  return {
    totalSlots,
    teachingSlots: teachingSlotsCount,
    revisionSlots,
    usedSlots,
    slackSlots,
    requiredMinutes,
    capacityMinutes,
    unscheduledLessonCount,
    predictedCompletionDate: lastRequired?.scheduledDate ?? null,
    feasibility,
    shortfallMinutes,
    alternatives: [],
    warnings: [],
    timetableSource,
  };
}

export function generateSchedule(input: {
  chapters: ChapterForSegments[];
  teachingSlots: TeachingSlot[];
  settings: PlannerSettings;
  timetableSource: ScheduleSummary['timetableSource'];
  keyFactory?: () => string;
}): { lessons: ScheduleLessonDraft[]; summary: ScheduleSummary } {
  const rev = defaultRevisionSlots(input.teachingSlots.length, input.settings.revisionSlots);
  const teaching = input.teachingSlots.slice(0, Math.max(0, input.teachingSlots.length - rev));
  const revision = input.teachingSlots.slice(Math.max(0, input.teachingSlots.length - rev));
  const segments = buildSegments(input.chapters);
  const packed = pack(segments, teaching, revision, [], {
    minChapterStartMinutes: input.settings.minChapterStartMinutes,
    fallbackMinutes: input.settings.fallbackPeriodMinutes ?? 40,
    keyFactory: input.keyFactory,
  });
  const summary = computeScheduleSummary(
    input.teachingSlots,
    rev,
    packed.lessons,
    packed.overflow,
    input.timetableSource,
  );
  return { lessons: packed.lessons, summary };
}

export type MoveViolation = { lessonKey: string; dependsOn?: string; conflictDate?: string };

export function moveLesson(
  lessons: ScheduleLessonDraft[],
  slots: TeachingSlot[],
  lessonKey: string,
  target: MoveTarget,
  mode: 'SINGLE' | 'WITH_FOLLOWING',
): { lessons: ScheduleLessonDraft[]; violations: MoveViolation[] } {
  const idx = lessons.findIndex((l) => l.lessonKey === lessonKey);
  if (idx < 0) return { lessons, violations: [{ lessonKey, dependsOn: 'missing' }] };
  const lesson = lessons[idx];
  if (lesson.frozen) return { lessons, violations: [{ lessonKey }] };

  const slotExists = slots.some((s) => s.date === target.date && s.periodNumber === target.periodNumber);
  if (!slotExists) return { lessons, violations: [{ lessonKey, conflictDate: target.date }] };

  const occupant = lessons.find(
    (l) => l.scheduledDate === target.date && l.periodNumber === target.periodNumber && l.lessonKey !== lessonKey,
  );
  if (occupant) return { lessons, violations: [{ lessonKey, dependsOn: occupant.lessonKey }] };

  if (mode === 'SINGLE') {
    const next = lessons.map((l) =>
      l.lessonKey === lessonKey
        ? { ...l, scheduledDate: target.date, periodNumber: target.periodNumber }
        : l,
    );
    return { lessons: next, violations: [] };
  }

  const tail = lessons
    .filter((l, i) => i >= idx && !l.frozen)
    .sort((a, b) => a.sequence - b.sequence);
  const slotList = slots.filter((s) => s.date >= target.date);
  const reassigned = lessons.filter((l) => !tail.some((t) => t.lessonKey === l.lessonKey));
  let si = 0;
  for (const l of tail) {
    const slot = slotList[si++];
    if (!slot) {
      reassigned.push({ ...l, scheduledDate: null, periodNumber: null });
    } else {
      reassigned.push({ ...l, scheduledDate: slot.date, periodNumber: slot.periodNumber });
    }
  }
  reassigned.sort((a, b) => a.sequence - b.sequence);
  return { lessons: reassigned, violations: [] };
}
