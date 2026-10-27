import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  TeachingRecordStatus,
  TeacherStatus,
  TimetablePeriodKind,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { AuditService } from '../audit/audit.service';
import { TimetableResolverService } from '../timetables/timetable-resolver.service';
import {
  dateFromIso,
  DEFAULT_SCHOOL_TIMEZONE,
  hmToMinutes,
  zonedDateIso,
  zonedMinutes,
} from '../teachers/teacher-checkin';
import { gradeClassLabel } from '../common/utils/section-class-label';
import { PlannerAccessService } from './planner-access.service';
import { lessonDisplayStatus } from './teaching-display-status';
import { UpsertTeachingRecordDto } from './dto/teaching-record.dto';
import { resolvePlannerLesson } from './planner-lesson-resolver';

@Injectable()
export class TeachingRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly resolver: TimetableResolverService,
    private readonly access: PlannerAccessService,
    private readonly audit: AuditService,
  ) {}

  async myDay(user: AuthUser, dateIso?: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const tz = DEFAULT_SCHOOL_TIMEZONE;
    const date = dateIso?.slice(0, 10) || zonedDateIso(new Date(), tz);
    const nowMin = zonedMinutes(new Date(), tz);
    const todayIso = zonedDateIso(new Date(), tz);

    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { userId: user.id, schoolId, status: TeacherStatus.ACTIVE },
    });
    if (!teacher) {
      throw new ForbiddenException({ code: 'TEACHER_REQUIRED', message: 'Teacher profile required' });
    }

    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      orderBy: { startDate: 'desc' },
    });
    if (!year) {
      return { date, timezone: tz, lessons: [], pendingReports: [] };
    }

    const assignments = await this.prisma.classSubject.findMany({
      where: {
        academicYearId: year.id,
        section: { schoolId },
        OR: [{ teacherId: teacher.id }, { assistantTeacherId: teacher.id }],
      },
      include: {
        section: { include: { grade: true } },
        subject: { select: { id: true, name: true } },
      },
    });

    const slotKeys = new Set<string>();
    const lessons: Array<Record<string, unknown>> = [];

    for (const cs of assignments) {
      const resolved = await this.resolver.periodsFor(schoolId, cs.sectionId, year.id, date);
      for (const period of resolved.periods) {
        if (period.kind !== TimetablePeriodKind.LESSON) continue;
        if (period.teacherId !== teacher.id) continue;
        if (period.subjectId && period.subjectId !== cs.subjectId) continue;
        const periodNumber = period.periodNumber ?? 0;
        const key = `${cs.sectionId}:${periodNumber}:${period.subjectId ?? cs.subjectId}`;
        if (slotKeys.has(key)) continue;
        slotKeys.add(key);

        const plannerCtx = await resolvePlannerLesson(
          this.prisma,
          schoolId,
          cs.sectionId,
          cs.subjectId,
          date,
          periodNumber,
        );
        const record = plannerCtx.planner
          ? await this.prisma.teachingRecord.findUnique({
              where: {
                plannerId_date_periodNumber: {
                  plannerId: plannerCtx.planner.id,
                  date: dateFromIso(date),
                  periodNumber,
                },
              },
            })
          : null;

        const startMin = period.startTime ? hmToMinutes(period.startTime) : null;
        const endMin = period.endTime ? hmToMinutes(period.endTime) : null;
        const periodStarted = startMin != null ? nowMin >= startMin : date < todayIso;
        const periodEnded = endMin != null ? nowMin >= endMin : date < todayIso;

        const attentionReasons: string[] = [];
        if (!plannerCtx.planner?.approvedVersionId) {
          attentionReasons.push('NO_APPROVED_PLANNER');
        }
        const displayStatus = lessonDisplayStatus({
          recordStatus: record?.status ?? null,
          periodStarted,
          periodEnded,
          attentionReasons,
        });

        lessons.push({
          sectionId: cs.sectionId,
          classLabel: gradeClassLabel(cs.section),
          subjectId: cs.subjectId,
          subjectName: cs.subject.name,
          periodNumber,
          startTime: period.startTime,
          endTime: period.endTime,
          timetableSource: resolved.source,
          planner: plannerCtx.planner
            ? { id: plannerCtx.planner.id, title: plannerCtx.planner.title }
            : null,
          plannedLesson: plannerCtx.lesson,
          record: record
            ? { id: record.id, status: record.status, updatedAt: record.updatedAt.toISOString() }
            : null,
          displayStatus,
          attentionReasons,
          canRecord: Boolean(plannerCtx.planner?.approvedVersionId),
        });
      }
    }

    lessons.sort((a, b) => {
      const pa = Number(a.periodNumber ?? 0);
      const pb = Number(b.periodNumber ?? 0);
      return pa - pb;
    });

    const pendingReports = await this.pendingReportsForTeacher(teacher.id, schoolId, todayIso);

    return { date, timezone: tz, lessons, pendingReports };
  }

  async upsertRecord(user: AuthUser, plannerId: string, dto: UpsertTeachingRecordDto) {
    const schoolId = this.tenant.requireSchoolId(user);
    const actor = await this.access.resolveActor(user);
    const planner = await this.prisma.academicPlanner.findFirst({
      where: { id: plannerId, schoolId },
      include: { teacher: true },
    });
    if (!planner) {
      throw new NotFoundException({ code: 'PLANNER_NOT_FOUND', message: 'Planner not found' });
    }
    if (!planner.approvedVersionId) {
      throw new UnprocessableEntityException({
        code: 'RECORD_PLANNER_NOT_PUBLISHED',
        message: 'No approved planner version',
      });
    }

    const isAssignedTeacher = actor.teacherProfileId === planner.teacherId;
    const isOnBehalf = actor.isHeadTeacher && !isAssignedTeacher;
    if (!isAssignedTeacher && !isOnBehalf && !actor.isPrincipalOrAdmin) {
      throw new ForbiddenException({ code: 'RECORD_FORBIDDEN', message: 'You cannot record for this planner' });
    }
    if (isOnBehalf && !dto.notes?.trim()) {
      throw new BadRequestException({ code: 'NOTES_REQUIRED', message: 'Notes are required when recording on behalf' });
    }

    const todayIso = zonedDateIso(new Date(), DEFAULT_SCHOOL_TIMEZONE);
    if (dto.date > todayIso) {
      throw new BadRequestException({ code: 'RECORD_FUTURE_DATE', message: 'Future dates are not allowed' });
    }

    this.validateRecordPayload(dto);

    const lessonKeys = new Set(
      (
        await this.prisma.plannerLesson.findMany({
          where: { versionId: planner.approvedVersionId },
          select: { lessonKey: true },
        })
      ).map((l) => l.lessonKey),
    );
    for (const al of dto.actualLessons) {
      if (!lessonKeys.has(al.lessonKey)) {
        throw new UnprocessableEntityException({
          code: 'RECORD_LESSON_INVALID',
          message: `Unknown lesson key: ${al.lessonKey}`,
        });
      }
    }

    const planned = await resolvePlannerLesson(
      this.prisma,
      schoolId,
      planner.sectionId,
      planner.subjectId,
      dto.date,
      dto.periodNumber,
    );
    const plannedLessonKey = planned.lesson?.lessonKey ?? null;

    const recordDate = dateFromIso(dto.date);
    const daysAgo = Math.floor((dateFromIso(todayIso).getTime() - recordDate.getTime()) / 86400000);
    const lateReport = daysAgo > 14;

    const existing = await this.prisma.teachingRecord.findUnique({
      where: {
        plannerId_date_periodNumber: {
          plannerId,
          date: recordDate,
          periodNumber: dto.periodNumber,
        },
      },
    });

    const data: Prisma.TeachingRecordUncheckedCreateInput = {
      schoolId,
      plannerId,
      sectionId: planner.sectionId,
      subjectId: planner.subjectId,
      teacherId: planner.teacherId,
      recordedById: user.id,
      date: recordDate,
      periodNumber: dto.periodNumber,
      plannerVersionId: planner.approvedVersionId,
      plannedLessonKey,
      status: dto.status,
      actualLessons: dto.actualLessons as unknown as Prisma.InputJsonValue,
      actualLibraryChapterId: dto.actualLibraryChapterId ?? null,
      completedPortionNote: dto.completedPortionNote?.trim() ?? null,
      unfinishedPortionNote: dto.unfinishedPortionNote?.trim() ?? null,
      actualMinutes: dto.actualMinutes ?? null,
      notes: dto.notes?.trim() ?? null,
      lateReport,
    };

    const saved = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        return tx.teachingRecord.update({
          where: { id: existing.id },
          data: {
            ...data,
            id: existing.id,
          },
        });
      }
      return tx.teachingRecord.create({ data });
    });

    this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: existing ? 'TEACHING_RECORD_UPDATED' : 'TEACHING_RECORD_CREATED',
      entityType: 'TeachingRecord',
      entityId: saved.id,
      metadata: existing ? { before: existing } : undefined,
    });

    return saved;
  }

  async listRecords(user: AuthUser, plannerId: string, from?: string, to?: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const planner = await this.prisma.academicPlanner.findFirst({ where: { id: plannerId, schoolId } });
    if (!planner) {
      throw new NotFoundException({ code: 'PLANNER_NOT_FOUND', message: 'Planner not found' });
    }
    await this.assertCanViewPlanner(user, planner);
    return this.prisma.teachingRecord.findMany({
      where: {
        plannerId,
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: dateFromIso(from) } : {}),
                ...(to ? { lte: dateFromIso(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ date: 'asc' }, { periodNumber: 'asc' }],
    });
  }

  private validateRecordPayload(dto: UpsertTeachingRecordDto) {
    if (dto.status === TeachingRecordStatus.PARTIAL && !dto.unfinishedPortionNote?.trim()) {
      throw new BadRequestException({
        code: 'UNFINISHED_NOTE_REQUIRED',
        message: 'Partial lessons require an unfinished portion note',
      });
    }
    if (dto.status === TeachingRecordStatus.NOT_TAUGHT && !dto.notes?.trim()) {
      throw new BadRequestException({ code: 'NOTES_REQUIRED', message: 'Notes are required for not taught' });
    }
    if (dto.status === TeachingRecordStatus.COMPLETED && dto.actualLessons.length === 0) {
      throw new BadRequestException({ code: 'ACTUAL_LESSONS_REQUIRED', message: 'Completed requires actual lessons' });
    }
    if (
      dto.status === TeachingRecordStatus.DIFFERENT_LESSON &&
      dto.actualLessons.length === 0 &&
      !dto.actualLibraryChapterId
    ) {
      throw new BadRequestException({
        code: 'DIFFERENT_LESSON_REQUIRED',
        message: 'Specify what was taught',
      });
    }
  }

  private async pendingReportsForTeacher(teacherId: string, schoolId: string, todayIso: string) {
    const from = dateFromIso(todayIso);
    from.setUTCDate(from.getUTCDate() - 14);
    const planners = await this.prisma.academicPlanner.findMany({
      where: { schoolId, teacherId, approvedVersionId: { not: null } },
      select: { id: true, approvedVersionId: true },
    });
    const pending: Array<{ plannerId: string; date: string; periodNumber: number; lessonKey: string }> = [];
    for (const p of planners) {
      const lessons = await this.prisma.plannerLesson.findMany({
        where: {
          versionId: p.approvedVersionId!,
          scheduledDate: { gte: from, lt: dateFromIso(todayIso) },
        },
      });
      for (const lesson of lessons) {
        if (lesson.periodNumber == null || !lesson.scheduledDate) continue;
        const dateStr = lesson.scheduledDate.toISOString().slice(0, 10);
        const rec = await this.prisma.teachingRecord.findUnique({
          where: {
            plannerId_date_periodNumber: {
              plannerId: p.id,
              date: lesson.scheduledDate,
              periodNumber: lesson.periodNumber,
            },
          },
        });
        if (!rec) {
          pending.push({
            plannerId: p.id,
            date: dateStr,
            periodNumber: lesson.periodNumber,
            lessonKey: lesson.lessonKey,
          });
        }
      }
    }
    return pending;
  }

  private async assertCanViewPlanner(
    user: AuthUser,
    planner: { id: string; teacherId: string; sectionId: string; createdById: string },
  ) {
    const actor = await this.access.resolveActor(user);
    if (actor.isPrincipalOrAdmin) return;
    if (actor.teacherProfileId === planner.teacherId) return;
    if (planner.createdById === actor.userId) return;
    throw new ForbiddenException({ code: 'PLANNER_FORBIDDEN', message: 'Access denied' });
  }
}
