import { Weekday } from '@prisma/client';
import { hmToMinutes, normalizeHm } from '../teachers/teacher-checkin';

export type ValidationIssue = {
  code: string;
  severity: 'BLOCKING' | 'WARNING';
  weekday?: Weekday;
  periodNumber?: number | null;
  message: string;
  relatedVersionId?: string;
};

export type PeriodDraft = {
  weekday: Weekday;
  periodNumber: number | null;
  kind: 'LESSON' | 'BREAK' | 'OTHER';
  startTime: string | null;
  endTime: string | null;
  label: string;
  subjectId?: string | null;
  teacherId?: string | null;
  subjectMatch?: 'UNKNOWN_SUBJECT' | 'AMBIGUOUS_SUBJECT';
  teacherMatch?: 'UNKNOWN_TEACHER' | 'AMBIGUOUS_TEACHER';
};

export function validateTimetablePeriods(periods: PeriodDraft[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byDay = new Map<Weekday, PeriodDraft[]>();

  for (const p of periods) {
    if (!byDay.has(p.weekday)) byDay.set(p.weekday, []);
    byDay.get(p.weekday)!.push(p);

    if (p.kind === 'LESSON') {
      const start = p.startTime ? normalizeHm(p.startTime) : null;
      const end = p.endTime ? normalizeHm(p.endTime) : null;
      if (!start || !end) {
        issues.push({
          code: 'MISSING_TIMES',
          severity: 'BLOCKING',
          weekday: p.weekday,
          periodNumber: p.periodNumber,
          message: 'Lesson period is missing start or end time',
        });
      } else {
        const sm = hmToMinutes(start);
        const em = hmToMinutes(end);
        if (em <= sm) {
          issues.push({
            code: 'INVALID_TIME',
            severity: 'BLOCKING',
            weekday: p.weekday,
            periodNumber: p.periodNumber,
            message: 'End time must be after start time',
          });
        }
      }
      if (p.subjectMatch === 'UNKNOWN_SUBJECT' || p.subjectMatch === 'AMBIGUOUS_SUBJECT') {
        issues.push({
          code: p.subjectMatch,
          severity: 'BLOCKING',
          weekday: p.weekday,
          periodNumber: p.periodNumber,
          message: `Subject could not be matched for ${p.label}`,
        });
      }
      if (p.teacherMatch === 'UNKNOWN_TEACHER') {
        issues.push({
          code: 'UNKNOWN_TEACHER',
          severity: 'WARNING',
          weekday: p.weekday,
          periodNumber: p.periodNumber,
          message: `Teacher could not be matched for ${p.label}`,
        });
      }
    }
  }

  for (const [weekday, dayPeriods] of byDay) {
    const lessons = dayPeriods.filter((p) => p.kind === 'LESSON' && p.periodNumber != null);
    const nums = lessons.map((p) => p.periodNumber!);
    const dup = nums.filter((n, i) => nums.indexOf(n) !== i);
    for (const n of new Set(dup)) {
      issues.push({
        code: 'DUPLICATE_PERIOD',
        severity: 'BLOCKING',
        weekday,
        periodNumber: n,
        message: `Duplicate period number ${n} on ${weekday}`,
      });
    }

    const timed = lessons
      .map((p) => {
        const start = p.startTime ? normalizeHm(p.startTime) : null;
        const end = p.endTime ? normalizeHm(p.endTime) : null;
        if (!start || !end) return null;
        return { p, sm: hmToMinutes(start), em: hmToMinutes(end) };
      })
      .filter(Boolean) as Array<{ p: PeriodDraft; sm: number; em: number }>;

    timed.sort((a, b) => a.sm - b.sm);
    for (let i = 0; i < timed.length; i++) {
      for (let j = i + 1; j < timed.length; j++) {
        if (timed[j].sm < timed[i].em) {
          issues.push({
            code: 'SECTION_OVERLAP',
            severity: 'BLOCKING',
            weekday,
            periodNumber: timed[j].p.periodNumber,
            message: 'Period times overlap on the same day',
          });
        }
      }
    }

    if (timed.length === 0) {
      issues.push({
        code: 'NO_LESSONS_ON_DAY',
        severity: 'WARNING',
        weekday,
        message: `No lesson periods on ${weekday}`,
      });
    }
  }

  return issues;
}
