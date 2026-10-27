import { Weekday } from '@prisma/client';
import { hmToMinutes, normalizeHm } from '../teachers/teacher-checkin';
import { ValidationIssue } from './timetable-validation';

export type CrossCheckPeriod = {
  versionId: string;
  sectionId: string;
  sectionLabel?: string;
  weekday: Weekday;
  periodNumber: number | null;
  kind: 'LESSON' | 'BREAK' | 'OTHER';
  startTime: string | null;
  endTime: string | null;
  teacherId: string | null;
};

function interval(period: CrossCheckPeriod): { sm: number; em: number } | null {
  if (period.kind !== 'LESSON' || !period.startTime || !period.endTime) return null;
  const start = normalizeHm(period.startTime);
  const end = normalizeHm(period.endTime);
  if (!start || !end) return null;
  const sm = hmToMinutes(start);
  const em = hmToMinutes(end);
  if (!Number.isFinite(sm) || !Number.isFinite(em) || em <= sm) return null;
  return { sm, em };
}

function overlaps(a: { sm: number; em: number }, b: { sm: number; em: number }): boolean {
  return a.sm < b.em && b.sm < a.em;
}

export function detectCrossVersionConflicts(periods: CrossCheckPeriod[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lessons = periods.filter((p) => p.kind === 'LESSON');

  for (let i = 0; i < lessons.length; i++) {
    for (let j = i + 1; j < lessons.length; j++) {
      const a = lessons[i];
      const b = lessons[j];
      if (a.weekday !== b.weekday) continue;
      const ia = interval(a);
      const ib = interval(b);
      if (!ia || !ib) continue;
      if (!overlaps(ia, ib)) continue;

      if (a.sectionId === b.sectionId) {
        issues.push({
          code: 'SECTION_OVERLAP',
          severity: 'BLOCKING',
          weekday: a.weekday,
          periodNumber: a.periodNumber,
          message: `Section has overlapping periods on ${a.weekday} (${a.startTime}–${a.endTime} vs ${b.startTime}–${b.endTime})`,
        });
      }

      if (a.teacherId && b.teacherId && a.teacherId === b.teacherId && a.sectionId !== b.sectionId) {
        issues.push({
          code: 'TEACHER_DOUBLE_BOOKED',
          severity: 'BLOCKING',
          weekday: a.weekday,
          periodNumber: a.periodNumber,
          message: `Teacher is double-booked on ${a.weekday} between sections (${a.sectionLabel ?? a.sectionId} ${a.startTime}–${a.endTime} vs ${b.sectionLabel ?? b.sectionId} ${b.startTime}–${b.endTime})`,
          relatedVersionId: b.versionId,
        });
      }
    }
  }

  return issues;
}
