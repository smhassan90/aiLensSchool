import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  TimetablePeriodKind,
  TimetableSourceType,
  TimetableVersionStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { AuditService } from '../audit/audit.service';
import { dateFromIso } from '../teachers/teacher-checkin';
import { normalizeHm } from '../teachers/teacher-checkin';
import { PeriodInputDto, PublishTimetableDto, UpdateTimetableVersionDto } from './dto/timetable.dto';
import { PeriodDraft, validateTimetablePeriods, ValidationIssue } from './timetable-validation';
import { CrossCheckPeriod, detectCrossVersionConflicts } from './timetable-cross-conflicts';
import { publishedOverlapsProposed } from './timetable-version-overlap';

@Injectable()
export class TimetableVersionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly audit: AuditService,
  ) {}

  async list(schoolId: string, sectionId?: string, status?: TimetableVersionStatus) {
    return this.prisma.timetableVersion.findMany({
      where: {
        schoolId,
        ...(sectionId ? { sectionId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: [{ sectionId: 'asc' }, { versionNumber: 'desc' }],
      select: {
        id: true,
        sectionId: true,
        versionNumber: true,
        status: true,
        sourceType: true,
        effectiveFrom: true,
        effectiveTo: true,
        revision: true,
        createdAt: true,
        publishedAt: true,
        section: { select: { name: true, grade: { select: { name: true } } } },
      },
    });
  }

  async getVersion(schoolId: string, versionId: string) {
    const version = await this.prisma.timetableVersion.findFirst({
      where: { id: versionId, schoolId },
      include: {
        periods: { orderBy: [{ weekday: 'asc' }, { sortOrder: 'asc' }, { periodNumber: 'asc' }] },
        section: { select: { id: true, name: true, grade: { select: { name: true } } } },
      },
    });
    if (!version) {
      throw new NotFoundException({ code: 'TIMETABLE_VERSION_NOT_FOUND', message: 'Timetable version not found' });
    }
    const validation = this.validatePeriodRows(version.periods);
    return { version, validation };
  }

  validatePeriodRows(
    periods: Array<{
      weekday: import('@prisma/client').Weekday;
      periodNumber: number | null;
      kind: import('@prisma/client').TimetablePeriodKind;
      startTime: string | null;
      endTime: string | null;
      label: string;
      subjectId: string | null;
      teacherId: string | null;
      rawSubjectText?: string | null;
      rawTeacherText?: string | null;
    }>,
  ): ValidationIssue[] {
    const drafts: PeriodDraft[] = periods.map((p) => ({
      weekday: p.weekday,
      periodNumber: p.periodNumber,
      kind: p.kind as 'LESSON' | 'BREAK' | 'OTHER',
      startTime: p.startTime,
      endTime: p.endTime,
      label: p.label,
      subjectId: p.subjectId,
      teacherId: p.teacherId,
    }));
    return validateTimetablePeriods(drafts);
  }

  async createManual(user: AuthUser, sectionId: string, academicYearId?: string, cloneFromVersionId?: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const year = await this.resolveYear(schoolId, academicYearId);
    const section = await this.prisma.section.findFirst({ where: { id: sectionId, schoolId } });
    if (!section) {
      throw new NotFoundException({ code: 'SECTION_NOT_FOUND', message: 'Section not found' });
    }

    let periods: PeriodInputDto[] = [];
    if (cloneFromVersionId) {
      const source = await this.prisma.timetableVersion.findFirst({
        where: { id: cloneFromVersionId, schoolId },
        include: { periods: true },
      });
      if (!source) {
        throw new NotFoundException({ code: 'TIMETABLE_VERSION_NOT_FOUND', message: 'Source version not found' });
      }
      periods = source.periods.map((p) => ({
        weekday: p.weekday,
        periodNumber: p.periodNumber,
        kind: p.kind,
        startTime: p.startTime,
        endTime: p.endTime,
        label: p.label,
        subjectId: p.subjectId,
        teacherId: p.teacherId,
        room: p.room,
      }));
    }

    const maxNum = await this.prisma.timetableVersion.aggregate({
      where: { sectionId, academicYearId: year.id },
      _max: { versionNumber: true },
    });

    const version = await this.prisma.timetableVersion.create({
      data: {
        schoolId,
        academicYearId: year.id,
        sectionId,
        sourceType: TimetableSourceType.MANUAL,
        versionNumber: (maxNum._max.versionNumber ?? 0) + 1,
        status: TimetableVersionStatus.DRAFT,
        revision: 0,
        createdById: user.id,
        periods: {
          create: periods.map((p, i) => this.periodCreateData(p, i)),
        },
      },
      include: { periods: true },
    });

    const validation = this.validatePeriodRows(version.periods);
    await this.prisma.timetableVersion.update({
      where: { id: version.id },
      data: { validation: validation as unknown as Prisma.InputJsonValue },
    });

    return this.getVersion(schoolId, version.id);
  }

  async update(user: AuthUser, versionId: string, dto: UpdateTimetableVersionDto) {
    const schoolId = this.tenant.requireSchoolId(user);
    const existing = await this.prisma.timetableVersion.findFirst({
      where: { id: versionId, schoolId },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'TIMETABLE_VERSION_NOT_FOUND', message: 'Timetable version not found' });
    }
    if (existing.status !== TimetableVersionStatus.DRAFT) {
      throw new ConflictException({
        code: 'TIMETABLE_VERSION_NOT_EDITABLE',
        message: 'Only draft versions can be edited',
      });
    }

    if (dto.sectionId && dto.sectionId !== existing.sectionId) {
      const section = await this.prisma.section.findFirst({ where: { id: dto.sectionId, schoolId } });
      if (!section) {
        throw new NotFoundException({ code: 'SECTION_NOT_FOUND', message: 'Section not found' });
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const count = await tx.timetableVersion.updateMany({
        where: { id: versionId, revision: dto.expectedRevision, status: TimetableVersionStatus.DRAFT },
        data: { revision: { increment: 1 }, ...(dto.sectionId ? { sectionId: dto.sectionId } : {}) },
      });
      if (count.count === 0) {
        throw new ConflictException({
          error: {
            code: 'TIMETABLE_VERSION_CONFLICT',
            message: 'This timetable was changed elsewhere',
            details: { currentRevision: existing.revision, status: existing.status },
          },
        });
      }
      await tx.timetablePeriod.deleteMany({ where: { versionId } });
      await tx.timetablePeriod.createMany({
        data: dto.periods.map((p, i) => ({
          versionId,
          weekday: p.weekday,
          periodNumber: p.periodNumber ?? null,
          kind: p.kind,
          startTime: p.startTime ? normalizeHm(p.startTime) : null,
          endTime: p.endTime ? normalizeHm(p.endTime) : null,
          label: p.label,
          subjectId: p.subjectId ?? null,
          teacherId: p.teacherId ?? null,
          room: p.room ?? null,
          sortOrder: i,
        })),
      });
      const periods = await tx.timetablePeriod.findMany({ where: { versionId } });
      const validation = this.validatePeriodRows(periods);
      await tx.timetableVersion.update({
        where: { id: versionId },
        data: { validation: validation as unknown as Prisma.InputJsonValue },
      });
      return versionId;
    });

    return this.getVersion(schoolId, updated);
  }

  async validateOnly(user: AuthUser, versionId: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const { validation } = await this.getVersion(schoolId, versionId);
    return { issues: validation };
  }

  async publish(user: AuthUser, dto: PublishTimetableDto) {
    const schoolId = this.tenant.requireSchoolId(user);
    const effectiveFrom = dateFromIso(dto.effectiveFrom);

    const result = await this.prisma.$transaction(async (tx) => {
      const published: Array<{ id: string; sectionId: string; versionNumber: number }> = [];
      const batchVersions = await tx.timetableVersion.findMany({
        where: { schoolId, id: { in: dto.items.map((i) => i.versionId) } },
        include: {
          periods: true,
          section: { select: { id: true, name: true, grade: { select: { name: true } } } },
        },
      });
      const yearIds = [...new Set(batchVersions.map((v) => v.academicYearId))];
      const publishedActive = await tx.timetableVersion.findMany({
        where: {
          schoolId,
          academicYearId: { in: yearIds },
          status: TimetableVersionStatus.PUBLISHED,
          id: { notIn: dto.items.map((i) => i.versionId) },
        },
        include: {
          periods: true,
          section: { select: { id: true, name: true, grade: { select: { name: true } } } },
        },
      });

      const crossPool: CrossCheckPeriod[] = [];
      const sectionLabel = (v: { section: { grade: { name: string }; name: string } }) =>
        `${v.section.grade.name} ${v.section.name}`;

      for (const v of batchVersions) {
        for (const p of v.periods) {
          crossPool.push({
            versionId: v.id,
            sectionId: v.sectionId,
            sectionLabel: sectionLabel(v),
            weekday: p.weekday,
            periodNumber: p.periodNumber,
            kind: p.kind as 'LESSON' | 'BREAK' | 'OTHER',
            startTime: p.startTime,
            endTime: p.endTime,
            teacherId: p.teacherId,
          });
        }
      }
      for (const v of publishedActive) {
        const supersededForSection = batchVersions.find(
          (b) => b.sectionId === v.sectionId && b.academicYearId === v.academicYearId,
        );
        if (supersededForSection) {
          continue;
        }
        const pubFrom = v.effectiveFrom;
        if (!pubFrom || !publishedOverlapsProposed({ effectiveFrom: pubFrom, effectiveTo: v.effectiveTo }, effectiveFrom)) {
          continue;
        }
        for (const p of v.periods) {
          if (p.kind !== TimetablePeriodKind.LESSON) continue;
          crossPool.push({
            versionId: v.id,
            sectionId: v.sectionId,
            sectionLabel: sectionLabel(v),
            weekday: p.weekday,
            periodNumber: p.periodNumber,
            kind: 'LESSON',
            startTime: p.startTime,
            endTime: p.endTime,
            teacherId: p.teacherId,
          });
        }
      }

      const crossIssues = detectCrossVersionConflicts(crossPool);
      const crossBlocking = crossIssues.filter((i) => i.severity === 'BLOCKING');
      if (crossBlocking.length) {
        throw new UnprocessableEntityException({
          error: {
            code: 'TIMETABLE_INVALID',
            message: 'Timetable has cross-section scheduling conflicts',
            details: { issues: crossBlocking },
          },
        });
      }

      for (const item of dto.items) {
        const version = batchVersions.find((v) => v.id === item.versionId);
        if (!version) {
          throw new NotFoundException({ code: 'TIMETABLE_VERSION_NOT_FOUND', message: 'Version not found' });
        }
        if (version.status !== TimetableVersionStatus.DRAFT) {
          throw new ConflictException({
            code: 'TIMETABLE_VERSION_NOT_EDITABLE',
            message: 'Only draft versions can be published',
          });
        }

        const cas = await tx.timetableVersion.updateMany({
          where: { id: item.versionId, revision: item.expectedRevision, status: TimetableVersionStatus.DRAFT },
          data: { revision: { increment: 1 } },
        });
        if (cas.count === 0) {
          throw new ConflictException({
            error: {
              code: 'TIMETABLE_VERSION_CONFLICT',
              message: 'Timetable version conflict',
              details: { versionId: item.versionId },
            },
          });
        }

        const issues = this.validatePeriodRows(version.periods);
        const blocking = issues.filter((i) => i.severity === 'BLOCKING');
        if (blocking.length) {
          throw new UnprocessableEntityException({
            error: {
              code: 'TIMETABLE_INVALID',
              message: 'Timetable has blocking validation issues',
              details: { issues },
            },
          });
        }

        const year = await tx.academicYear.findFirst({ where: { id: version.academicYearId, schoolId } });
        if (!year) {
          throw new UnprocessableEntityException({ code: 'ACADEMIC_YEAR_NOT_FOUND', message: 'Academic year not found' });
        }
        if (effectiveFrom < year.startDate || effectiveFrom > year.endDate) {
          throw new UnprocessableEntityException({
            code: 'TIMETABLE_EFFECTIVE_DATE_INVALID',
            message: 'Effective date must fall within the academic year',
          });
        }

        const previous = await tx.timetableVersion.findFirst({
          where: {
            sectionId: version.sectionId,
            academicYearId: version.academicYearId,
            status: { in: [TimetableVersionStatus.PUBLISHED, TimetableVersionStatus.SUPERSEDED] },
            effectiveFrom: { lte: effectiveFrom },
          },
          orderBy: { effectiveFrom: 'desc' },
        });
        if (previous?.effectiveFrom && effectiveFrom <= previous.effectiveFrom) {
          throw new UnprocessableEntityException({
            code: 'TIMETABLE_EFFECTIVE_DATE_INVALID',
            message: 'Effective date must be after the previous published version',
          });
        }

        if (previous && previous.status === TimetableVersionStatus.PUBLISHED) {
          const prevEnd = new Date(effectiveFrom);
          prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
          await tx.timetableVersion.update({
            where: { id: previous.id },
            data: { status: TimetableVersionStatus.SUPERSEDED, effectiveTo: prevEnd },
          });
        }

        const maxNum = await tx.timetableVersion.aggregate({
          where: { sectionId: version.sectionId, academicYearId: version.academicYearId },
          _max: { versionNumber: true },
        });

        await tx.timetableVersion.update({
          where: { id: version.id },
          data: {
            status: TimetableVersionStatus.PUBLISHED,
            effectiveFrom,
            versionNumber: (maxNum._max.versionNumber ?? 0) + 1,
            publishedAt: new Date(),
            publishedById: user.id,
            validation: issues as unknown as Prisma.InputJsonValue,
          },
        });

        published.push({ id: version.id, sectionId: version.sectionId, versionNumber: (maxNum._max.versionNumber ?? 0) + 1 });
      }

      return { published, affectedPlanners: [] as unknown[] };
    });

    this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'TIMETABLE_PUBLISHED',
      entityType: 'TimetableVersion',
      metadata: { effectiveFrom: dto.effectiveFrom, versionIds: dto.items.map((i) => i.versionId) },
    });

    return result;
  }

  async adoptLegacy(user: AuthUser, sectionIds?: string[]) {
    const schoolId = this.tenant.requireSchoolId(user);
    const year = await this.resolveYear(schoolId);
    const sections = await this.prisma.section.findMany({
      where: {
        schoolId,
        ...(sectionIds?.length ? { id: { in: sectionIds } } : {}),
        timetableSlots: { some: { academicYearId: year.id } },
      },
      select: { id: true },
    });

    const created: string[] = [];
    for (const section of sections) {
      const hasVersion = await this.prisma.timetableVersion.count({
        where: { sectionId: section.id, academicYearId: year.id },
      });
      if (hasVersion > 0) continue;

      const slots = await this.prisma.timetableSlot.findMany({
        where: { schoolId, sectionId: section.id, academicYearId: year.id },
      });
      if (!slots.length) continue;

      const version = await this.prisma.timetableVersion.create({
        data: {
          schoolId,
          academicYearId: year.id,
          sectionId: section.id,
          sourceType: TimetableSourceType.LEGACY,
          versionNumber: 1,
          status: TimetableVersionStatus.PUBLISHED,
          effectiveFrom: year.startDate,
          revision: 0,
          createdById: user.id,
          publishedById: user.id,
          publishedAt: new Date(),
          periods: {
            create: slots.map((s, i) => ({
              weekday: s.weekday,
              periodNumber: s.periodNumber,
              kind: TimetablePeriodKind.LESSON,
              startTime: s.startTime?.slice(0, 5) ?? null,
              endTime: s.endTime?.slice(0, 5) ?? null,
              label: s.title,
              subjectId: s.subjectId,
              teacherId: s.teacherId,
              sortOrder: i,
            })),
          },
        },
      });
      created.push(version.id);
    }

    return { adopted: created };
  }

  private periodCreateData(p: PeriodInputDto, sortOrder: number) {
    return {
      weekday: p.weekday,
      periodNumber: p.periodNumber ?? null,
      kind: p.kind,
      startTime: p.startTime ? normalizeHm(p.startTime) : null,
      endTime: p.endTime ? normalizeHm(p.endTime) : null,
      label: p.label,
      subjectId: p.subjectId ?? null,
      teacherId: p.teacherId ?? null,
      room: p.room ?? null,
      sortOrder,
    };
  }

  private async resolveYear(schoolId: string, academicYearId?: string) {
    if (academicYearId) {
      const year = await this.prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId } });
      if (!year) {
        throw new NotFoundException({ code: 'ACADEMIC_YEAR_NOT_FOUND', message: 'Academic year not found' });
      }
      return year;
    }
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      orderBy: { startDate: 'desc' },
    });
    if (!year) {
      throw new UnprocessableEntityException({ code: 'ACADEMIC_YEAR_NOT_FOUND', message: 'No current academic year' });
    }
    return year;
  }
}
