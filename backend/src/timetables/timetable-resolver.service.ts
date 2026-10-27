import { Injectable } from '@nestjs/common';
import { TimetablePeriodKind, TimetableVersionStatus, Weekday } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { dateFromIso } from '../teachers/teacher-checkin';

export type ResolvedPeriod = {
  weekday: Weekday;
  periodNumber: number | null;
  kind: TimetablePeriodKind;
  startTime: string | null;
  endTime: string | null;
  label: string;
  subjectId: string | null;
  teacherId: string | null;
};

export type TimetableResolveSource = 'VERSIONED' | 'LEGACY' | 'NONE';

@Injectable()
export class TimetableResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async effectiveVersion(
    sectionId: string,
    academicYearId: string,
    dateIso: string,
  ): Promise<{ source: TimetableResolveSource; versionId: string | null }> {
    const at = dateFromIso(dateIso);
    const version = await this.prisma.timetableVersion.findFirst({
      where: {
        sectionId,
        academicYearId,
        status: { in: [TimetableVersionStatus.PUBLISHED, TimetableVersionStatus.SUPERSEDED] },
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }],
      },
      orderBy: [{ effectiveFrom: 'desc' }, { versionNumber: 'desc' }],
    });
    if (version) return { source: 'VERSIONED', versionId: version.id };

    const anyVersion = await this.prisma.timetableVersion.count({ where: { sectionId, academicYearId } });
    if (anyVersion === 0) {
      const legacyCount = await this.prisma.timetableSlot.count({ where: { sectionId, academicYearId } });
      if (legacyCount > 0) return { source: 'LEGACY', versionId: null };
      return { source: 'NONE', versionId: null };
    }
    return { source: 'NONE', versionId: null };
  }

  async periodsFor(
    schoolId: string,
    sectionId: string,
    academicYearId: string,
    dateIso: string,
  ): Promise<{ source: TimetableResolveSource; versionId: string | null; periods: ResolvedPeriod[] }> {
    const { source, versionId } = await this.effectiveVersion(sectionId, academicYearId, dateIso);
    if (source === 'VERSIONED' && versionId) {
      const jsDay = dateFromIso(dateIso).getUTCDay();
      const weekdayMap: Record<number, Weekday | undefined> = {
        1: Weekday.MONDAY,
        2: Weekday.TUESDAY,
        3: Weekday.WEDNESDAY,
        4: Weekday.THURSDAY,
        5: Weekday.FRIDAY,
      };
      const weekday = weekdayMap[jsDay];
      if (!weekday) return { source, versionId, periods: [] };
      const rows = await this.prisma.timetablePeriod.findMany({
        where: { versionId, weekday },
        orderBy: [{ sortOrder: 'asc' }, { periodNumber: 'asc' }],
      });
      return {
        source,
        versionId,
        periods: rows.map((r) => ({
          weekday: r.weekday,
          periodNumber: r.periodNumber,
          kind: r.kind,
          startTime: r.startTime,
          endTime: r.endTime,
          label: r.label,
          subjectId: r.subjectId,
          teacherId: r.teacherId,
        })),
      };
    }

    if (source === 'LEGACY') {
      const jsDay = dateFromIso(dateIso).getUTCDay();
      const weekdayMap: Record<number, Weekday | undefined> = {
        1: Weekday.MONDAY,
        2: Weekday.TUESDAY,
        3: Weekday.WEDNESDAY,
        4: Weekday.THURSDAY,
        5: Weekday.FRIDAY,
      };
      const weekday = weekdayMap[jsDay];
      if (!weekday) return { source, versionId, periods: [] };
      const slots = await this.prisma.timetableSlot.findMany({
        where: { schoolId, sectionId, academicYearId, weekday },
        orderBy: { periodNumber: 'asc' },
      });
      return {
        source,
        versionId,
        periods: slots.map((s) => ({
          weekday: s.weekday,
          periodNumber: s.periodNumber,
          kind: TimetablePeriodKind.LESSON,
          startTime: s.startTime?.slice(0, 5) ?? null,
          endTime: s.endTime?.slice(0, 5) ?? null,
          label: s.title,
          subjectId: s.subjectId,
          teacherId: s.teacherId,
        })),
      };
    }

    return { source: 'NONE', versionId, periods: [] };
  }

  async weeklyGridSlots(
    schoolId: string,
    sectionId: string,
    academicYearId: string,
    asOfDateIso: string,
  ): Promise<{
    source: TimetableResolveSource;
    versionId: string | null;
    slots: Array<{
      id: string;
      weekday: Weekday;
      periodNumber: number;
      startTime: string | null;
      endTime: string | null;
      title: string;
      subjectId: string | null;
      subject: { id: string; name: string } | null;
      teacherId: string | null;
      teacher: {
        id: string;
        gender: string | null;
        user: { firstName: string; lastName: string | null };
      } | null;
    }>;
  }> {
    const { source, versionId } = await this.effectiveVersion(sectionId, academicYearId, asOfDateIso);
    if (source === 'VERSIONED' && versionId) {
      const rows = await this.prisma.timetablePeriod.findMany({
        where: { versionId },
        orderBy: [{ weekday: 'asc' }, { sortOrder: 'asc' }, { periodNumber: 'asc' }],
        include: {
          subject: { select: { id: true, name: true } },
          teacher: {
            select: { id: true, gender: true, user: { select: { firstName: true, lastName: true } } },
          },
        },
      });
      const slots = rows
        .filter((r) => r.kind === TimetablePeriodKind.LESSON)
        .map((r) => ({
          id: r.id,
          weekday: r.weekday,
          periodNumber: r.periodNumber ?? 0,
          startTime: r.startTime,
          endTime: r.endTime,
          title: r.label,
          subjectId: r.subjectId,
          subject: r.subject,
          teacherId: r.teacherId,
          teacher: r.teacher,
        }));
      return { source, versionId, slots };
    }
    if (source === 'LEGACY') {
      const legacy = await this.loadLegacySlots(schoolId, sectionId, academicYearId);
      const slots = legacy.map((s) => ({
        id: s.id,
        weekday: s.weekday,
        periodNumber: s.periodNumber,
        startTime: s.startTime?.slice(0, 5) ?? null,
        endTime: s.endTime?.slice(0, 5) ?? null,
        title: s.title,
        subjectId: s.subjectId,
        subject: s.subject,
        teacherId: s.teacherId,
        teacher: s.teacher,
      }));
      return { source, versionId, slots };
    }
    return { source, versionId, slots: [] };
  }

  async loadLegacySlots(schoolId: string, sectionId: string, academicYearId: string) {
    return this.prisma.timetableSlot.findMany({
      where: { schoolId, sectionId, academicYearId },
      orderBy: [{ periodNumber: 'asc' }, { weekday: 'asc' }],
      include: {
        subject: { select: { id: true, name: true } },
        teacher: {
          select: { id: true, gender: true, user: { select: { firstName: true, lastName: true } } },
        },
      },
    });
  }
}
