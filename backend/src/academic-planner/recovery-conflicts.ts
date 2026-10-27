import { Weekday } from '@prisma/client';
import { CrossCheckPeriod, detectCrossVersionConflicts } from '../timetables/timetable-cross-conflicts';
import { ValidationIssue } from '../timetables/timetable-validation';
import { ScheduleLessonDraft } from './planner-types';

export type RecoveryTimetableConflict = {
  code: string;
  date: string | null;
  periodNumber: number | null;
  teacherId: string | null;
  sectionId: string | null;
  message: string;
};

const JS_TO_WEEKDAY: Weekday[] = [
  Weekday.MONDAY,
  Weekday.MONDAY,
  Weekday.TUESDAY,
  Weekday.WEDNESDAY,
  Weekday.THURSDAY,
  Weekday.FRIDAY,
  Weekday.MONDAY,
];

export function weekdayFromDateIso(dateIso: string): Weekday {
  const d = new Date(`${dateIso}T12:00:00.000Z`);
  const day = d.getUTCDay();
  if (day === 0 || day === 6) {
    return Weekday.MONDAY;
  }
  return JS_TO_WEEKDAY[day]!;
}

export function proposalLessonsToCrossPeriods(
  lessons: ScheduleLessonDraft[],
  sectionId: string,
  teacherId: string,
  versionId = 'recovery-candidate',
): CrossCheckPeriod[] {
  const out: CrossCheckPeriod[] = [];
  for (const l of lessons) {
    if (!l.scheduledDate || l.periodNumber == null || !l.slotStartTime || !l.slotEndTime) continue;
    out.push({
      versionId,
      sectionId,
      weekday: weekdayFromDateIso(l.scheduledDate),
      periodNumber: l.periodNumber,
      kind: 'LESSON',
      startTime: l.slotStartTime,
      endTime: l.slotEndTime,
      teacherId,
    });
  }
  return out;
}

export function detectProposalSlotCollisions(
  lessons: ScheduleLessonDraft[],
  sectionId: string,
): RecoveryTimetableConflict[] {
  const bySlot = new Map<string, ScheduleLessonDraft[]>();
  for (const l of lessons) {
    if (!l.scheduledDate || l.periodNumber == null) continue;
    const key = `${l.scheduledDate}|${l.periodNumber}`;
    const list = bySlot.get(key) ?? [];
    list.push(l);
    bySlot.set(key, list);
  }
  const conflicts: RecoveryTimetableConflict[] = [];
  for (const [key, group] of bySlot) {
    if (group.length <= 1) continue;
    const [date, period] = key.split('|');
    conflicts.push({
      code: 'SECTION_PERIOD_COLLISION',
      date,
      periodNumber: Number(period),
      teacherId: null,
      sectionId,
      message: `Section has ${group.length} lessons in period ${period} on ${date}`,
    });
  }
  return conflicts;
}

export function validationIssuesToRecoveryConflicts(issues: ValidationIssue[]): RecoveryTimetableConflict[] {
  return issues
    .filter((i) => i.severity === 'BLOCKING')
    .map((i) => ({
      code: i.code,
      date: null,
      periodNumber: i.periodNumber ?? null,
      teacherId: null,
      sectionId: null,
      message: i.message,
    }));
}

export function detectRecoveryTimetableConflicts(
  proposalLessons: ScheduleLessonDraft[],
  sectionId: string,
  teacherId: string,
  externalPeriods: CrossCheckPeriod[],
): RecoveryTimetableConflict[] {
  const internal = detectProposalSlotCollisions(proposalLessons, sectionId);
  const proposalPeriods = proposalLessonsToCrossPeriods(proposalLessons, sectionId, teacherId);
  const pool = [...externalPeriods, ...proposalPeriods];
  const cross = validationIssuesToRecoveryConflicts(detectCrossVersionConflicts(pool));
  return [...internal, ...cross];
}
