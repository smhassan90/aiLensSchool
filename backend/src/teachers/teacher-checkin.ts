import { AttendanceStatus, TeacherStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export const DEFAULT_TEACHER_LATE_AFTER = '08:15';
export const DEFAULT_TEACHER_ABSENT_AFTER = '09:00';
export const DEFAULT_SCHOOL_TIMEZONE = 'Asia/Karachi';

export const TEACHER_ATTENDANCE_SOURCES = ['ADMIN', 'MACHINE', 'SYSTEM'] as const;
export type TeacherAttendanceSource = (typeof TEACHER_ATTENDANCE_SOURCES)[number];

const HM_RE = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

export function hmToMinutes(hm: string): number {
  const match = HM_RE.exec(hm.trim());
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function normalizeHm(hm: string): string | null {
  const match = HM_RE.exec(hm.trim());
  if (!match) return null;
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

export function zonedMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const h = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

export function zonedDateIso(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function dateFromIso(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Status for a recorded check-in. ABSENT is only used when there is no check-in (see finalizeTeacherAbsences). */
export function statusFromCheckIn(
  checkedInAt: Date,
  lateAfter: string,
  _absentAfter: string,
  timeZone: string,
): AttendanceStatus {
  const punch = zonedMinutes(checkedInAt, timeZone);
  const lateAt = hmToMinutes(lateAfter);
  if (punch < lateAt) return AttendanceStatus.PRESENT;
  return AttendanceStatus.LATE;
}

export function shouldFinalizeAbsences(
  dateIso: string,
  now: Date,
  timeZone: string,
  absentAfter: string,
): boolean {
  const todayIso = zonedDateIso(now, timeZone);
  if (dateIso > todayIso) return false;
  if (dateIso < todayIso) return true;
  return zonedMinutes(now, timeZone) >= hmToMinutes(absentAfter);
}

export type TeacherAttendancePolicy = {
  lateAfter: string;
  absentAfter: string;
  timezone: string;
};

export function readTeacherAttendancePolicy(row?: {
  timezone?: string | null;
  teacherLateAfter?: string | null;
  teacherAbsentAfter?: string | null;
} | null): TeacherAttendancePolicy {
  return {
    lateAfter: normalizeHm(row?.teacherLateAfter ?? '') ?? DEFAULT_TEACHER_LATE_AFTER,
    absentAfter: normalizeHm(row?.teacherAbsentAfter ?? '') ?? DEFAULT_TEACHER_ABSENT_AFTER,
    timezone: row?.timezone || DEFAULT_SCHOOL_TIMEZONE,
  };
}

export async function loadTeacherAttendancePolicy(
  prisma: PrismaService,
  schoolId: string,
): Promise<TeacherAttendancePolicy> {
  const row = await prisma.schoolSettings.findUnique({
    where: { schoolId },
    select: { timezone: true, teacherLateAfter: true, teacherAbsentAfter: true },
  });
  return readTeacherAttendancePolicy(row);
}

export async function finalizeTeacherAbsences(
  prisma: PrismaService,
  schoolId: string,
  dateIso: string,
  now = new Date(),
) {
  const policy = await loadTeacherAttendancePolicy(prisma, schoolId);
  if (!shouldFinalizeAbsences(dateIso, now, policy.timezone, policy.absentAfter)) {
    return { finalized: 0, policy };
  }

  const day = dateFromIso(dateIso);
  const [teachers, existing] = await Promise.all([
    prisma.teacherProfile.findMany({
      where: { schoolId, status: TeacherStatus.ACTIVE },
      select: { id: true },
    }),
    prisma.teacherAttendance.findMany({
      where: { schoolId, date: day },
      select: { teacherId: true },
    }),
  ]);
  const have = new Set(existing.map((row) => row.teacherId));
  const missing = teachers.filter((teacher) => !have.has(teacher.id));
  if (!missing.length) return { finalized: 0, policy };

  await prisma.teacherAttendance.createMany({
    data: missing.map((teacher) => ({
      schoolId,
      teacherId: teacher.id,
      date: day,
      status: AttendanceStatus.ABSENT,
      source: 'SYSTEM',
    })),
    skipDuplicates: true,
  });
  return { finalized: missing.length, policy };
}

export function earliestPunch(existing: Date | null | undefined, incoming: Date): Date {
  if (!existing) return incoming;
  return existing <= incoming ? existing : incoming;
}
