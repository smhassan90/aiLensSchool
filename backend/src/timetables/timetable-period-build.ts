import { TimetablePeriodKind, Weekday } from '@prisma/client';
import { ExtractedRow } from './timetable-csv';
import {
  matchSubject,
  matchTeacher,
  SubjectCandidate,
  TeacherCandidate,
} from './timetable-matching';

export type BuiltPeriodInput = {
  weekday: Weekday;
  periodNumber: number | null;
  kind: TimetablePeriodKind;
  startTime: string | null;
  endTime: string | null;
  label: string;
  subjectId: string | null;
  teacherId: string | null;
  room: string | null;
  rawSubjectText: string | null;
  rawTeacherText: string | null;
  subjectMatch?: 'UNKNOWN_SUBJECT' | 'AMBIGUOUS_SUBJECT';
  teacherMatch?: 'UNKNOWN_TEACHER' | 'AMBIGUOUS_TEACHER';
};

const WEEKDAYS: Weekday[] = [
  Weekday.MONDAY,
  Weekday.TUESDAY,
  Weekday.WEDNESDAY,
  Weekday.THURSDAY,
  Weekday.FRIDAY,
];

export function buildPeriodInputsFromExtracted(
  rows: ExtractedRow[],
  subjects: SubjectCandidate[],
  teachers: TeacherCandidate[],
): BuiltPeriodInput[] {
  const out: BuiltPeriodInput[] = [];
  let sortOrder = 0;
  for (const row of rows) {
    for (const weekday of WEEKDAYS) {
      const cell = row.cells[weekday];
      if (row.kind === 'BREAK') {
        out.push({
          weekday,
          periodNumber: null,
          kind: TimetablePeriodKind.BREAK,
          startTime: row.startTime,
          endTime: row.endTime,
          label: cell?.subjectText?.trim() || 'Break',
          subjectId: null,
          teacherId: null,
          room: null,
          rawSubjectText: cell?.subjectText ?? null,
          rawTeacherText: cell?.teacherText ?? null,
        });
        sortOrder++;
        continue;
      }
      if (row.kind !== 'LESSON' || !row.periodNumber) continue;
      if (!cell?.subjectText?.trim()) continue;

      const subjectText = cell.subjectText.trim();
      const teacherText = cell.teacherText?.trim() ?? '';
      const subjectResult = matchSubject(subjectText, subjects);
      const teacherResult = teacherText ? matchTeacher(teacherText, teachers) : { status: 'UNKNOWN_TEACHER' as const };

      out.push({
        weekday,
        periodNumber: row.periodNumber,
        kind: TimetablePeriodKind.LESSON,
        startTime: row.startTime,
        endTime: row.endTime,
        label: subjectText,
        subjectId: subjectResult.status === 'MATCHED' ? subjectResult.subjectId! : null,
        teacherId: teacherResult.status === 'MATCHED' ? teacherResult.teacherId! : null,
        room: null,
        rawSubjectText: subjectText,
        rawTeacherText: teacherText || null,
        subjectMatch:
          subjectResult.status === 'UNKNOWN_SUBJECT' || subjectResult.status === 'AMBIGUOUS_SUBJECT'
            ? subjectResult.status
            : undefined,
        teacherMatch:
          teacherResult.status === 'UNKNOWN_TEACHER' || teacherResult.status === 'AMBIGUOUS_TEACHER'
            ? teacherResult.status
            : undefined,
      });
      sortOrder++;
    }
  }
  return out;
}
