import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ObservationMatch, TimetablePeriodKind } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { AuditService } from '../audit/audit.service';
import { TimetableResolverService } from '../timetables/timetable-resolver.service';
import { HeadTeachersService } from '../head-teachers/head-teachers.service';
import {
  dateFromIso,
  DEFAULT_SCHOOL_TIMEZONE,
  hmToMinutes,
  zonedDateIso,
  zonedMinutes,
} from '../teachers/teacher-checkin';
import { gradeClassLabel } from '../common/utils/section-class-label';
import { lessonDisplayStatus, observationNeedsAttention } from './teaching-display-status';
import { CreateObservationDto } from './dto/classroom-rounds.dto';
import { resolvePlannerLesson } from './planner-lesson-resolver';

@Injectable()
export class ClassroomRoundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly resolver: TimetableResolverService,
    private readonly headTeachers: HeadTeachersService,
    private readonly audit: AuditService,
  ) {}

  async now(user: AuthUser, atIso?: string, sectionIdsParam?: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const actor = await this.resolveScope(user);
    const tz = DEFAULT_SCHOOL_TIMEZONE;
    const at = atIso ? new Date(atIso) : new Date();
    const date = zonedDateIso(at, tz);
    const nowMin = zonedMinutes(at, tz);

    let sectionIds = actor.sectionIds;
    if (sectionIdsParam) {
      const filter = sectionIdsParam.split(',').map((s) => s.trim()).filter(Boolean);
      sectionIds = sectionIds.filter((id) => filter.includes(id));
    }

    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      orderBy: { startDate: 'desc' },
    });
    if (!year) {
      return { at: at.toISOString(), date, timezone: tz, sections: [] };
    }

    const sections = await this.prisma.section.findMany({
      where: { schoolId, id: { in: sectionIds } },
      include: { grade: true },
      orderBy: [{ grade: { level: 'asc' } }, { name: 'asc' }],
    });

    const payloadSections = [];
    for (const section of sections) {
      const resolved = await this.resolver.periodsFor(schoolId, section.id, year.id, date);
      const lessons = resolved.periods.filter((p) => p.kind === TimetablePeriodKind.LESSON);
      if (!lessons.length) {
        payloadSections.push({
          section: { id: section.id, label: gradeClassLabel(section) },
          state: 'NO_TIMETABLE',
          displayStatus: 'SCHEDULED',
          attentionReasons: [],
          teacherPresence: 'UNKNOWN',
        });
        continue;
      }

      let current = lessons.find((p) => {
        if (!p.startTime || !p.endTime) return false;
        const s = hmToMinutes(p.startTime);
        const e = hmToMinutes(p.endTime);
        return nowMin >= s && nowMin < e;
      });

      const period = current ?? lessons[0];
      const periodNumber = period.periodNumber ?? 0;
      const subject = period.subjectId
        ? await this.prisma.subject.findUnique({ where: { id: period.subjectId }, select: { name: true } })
        : null;

      const plannerCtx = period.subjectId
        ? await resolvePlannerLesson(this.prisma, schoolId, section.id, period.subjectId, date, periodNumber)
        : { planner: null, lesson: null };

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

      const obs = await this.prisma.classroomObservation.findFirst({
        where: { schoolId, sectionId: section.id, date: dateFromIso(date), periodNumber },
        orderBy: { observedAt: 'desc' },
      });

      const startMin = period.startTime ? hmToMinutes(period.startTime) : null;
      const endMin = period.endTime ? hmToMinutes(period.endTime) : null;
      const periodEnded = endMin != null ? nowMin >= endMin : false;
      const periodStarted = startMin != null ? nowMin >= startMin : true;

      const attentionReasons: string[] = [];
      if (obs && observationNeedsAttention(obs.match)) {
        attentionReasons.push('OBSERVATION_MISMATCH');
      }
      if (!plannerCtx.planner) {
        attentionReasons.push('NO_APPROVED_PLANNER');
      }

      const displayStatus = lessonDisplayStatus({
        recordStatus: record?.status ?? null,
        periodStarted,
        periodEnded,
        attentionReasons,
      });

      payloadSections.push({
        section: { id: section.id, label: gradeClassLabel(section) },
        state: current ? 'LESSON' : 'BETWEEN_PERIODS',
        period: {
          periodNumber,
          startTime: period.startTime,
          endTime: period.endTime,
          subject: subject?.name ?? period.label,
        },
        planner: plannerCtx.planner ? { id: plannerCtx.planner.id, title: plannerCtx.planner.title } : undefined,
        plannedLesson: plannerCtx.lesson,
        record: record ? { status: record.status, updatedAt: record.updatedAt.toISOString() } : undefined,
        lastObservation: obs
          ? { match: obs.match, observedAt: obs.observedAt.toISOString() }
          : undefined,
        teacherPresence: 'UNKNOWN',
        displayStatus,
        attentionReasons,
      });
    }

    return { at: at.toISOString(), date, timezone: tz, sections: payloadSections };
  }

  async createObservation(user: AuthUser, dto: CreateObservationDto) {
    const schoolId = this.tenant.requireSchoolId(user);
    await this.headTeachers.assertHeadTeacher(user).catch(() => {
      throw new ForbiddenException({ code: 'HEAD_TEACHER_REQUIRED', message: 'Head teacher access required' });
    });

    const tz = DEFAULT_SCHOOL_TIMEZONE;
    const todayIso = zonedDateIso(new Date(), tz);
    if (dto.date > todayIso) {
      throw new BadRequestException({ code: 'OBSERVATION_FUTURE', message: 'Cannot observe a future date' });
    }

    if (dto.clientRequestId) {
      const existing = await this.prisma.classroomObservation.findUnique({
        where: { clientRequestId: dto.clientRequestId },
      });
      if (existing && existing.observerUserId === user.id) {
        return existing;
      }
    }

    const section = await this.prisma.section.findFirst({ where: { id: dto.sectionId, schoolId } });
    if (!section) {
      throw new NotFoundException({ code: 'SECTION_NOT_FOUND', message: 'Section not found' });
    }

    const periodNumber = dto.periodNumber ?? null;
    const plannerCtx =
      dto.subjectId && periodNumber != null
        ? await resolvePlannerLesson(this.prisma, schoolId, dto.sectionId, dto.subjectId, dto.date, periodNumber)
        : { planner: null, lesson: null };

    const row = await this.prisma.classroomObservation.create({
      data: {
        schoolId,
        sectionId: dto.sectionId,
        subjectId: dto.subjectId ?? null,
        teacherId: dto.teacherId ?? null,
        plannerId: plannerCtx.planner?.id ?? null,
        plannerVersionId: plannerCtx.planner?.approvedVersionId ?? null,
        plannedLessonKey: plannerCtx.lesson?.lessonKey ?? null,
        observedLessonKey: dto.observedLessonKey ?? null,
        observedLibraryChapterId: dto.observedLibraryChapterId ?? null,
        observedStage: dto.observedStage ?? null,
        date: dateFromIso(dto.date),
        periodNumber,
        observedAt: new Date(),
        observerUserId: user.id,
        clientRequestId: dto.clientRequestId ?? null,
        teacherPresent: dto.teacherPresent ?? null,
        match: dto.match,
        notes: dto.notes?.trim() ?? null,
        followUpRequired: dto.followUpRequired ?? false,
        followUpAction: dto.followUpAction ?? null,
        followUpDueDate: dto.followUpDueDate ? dateFromIso(dto.followUpDueDate) : null,
        sharedWithTeacher: dto.sharedWithTeacher ?? false,
      },
    });

    this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'CLASSROOM_OBSERVATION_RECORDED',
      entityType: 'ClassroomObservation',
      entityId: row.id,
    });

    return row;
  }

  private async resolveScope(user: AuthUser): Promise<{ sectionIds: string[]; isSchoolWide: boolean }> {
    const schoolId = this.tenant.requireSchoolId(user);
    const roles = user.roles ?? [];
    if (roles.includes('PRINCIPAL') || roles.includes('SCHOOL_ADMIN')) {
      const sections = await this.prisma.section.findMany({ where: { schoolId }, select: { id: true } });
      return { sectionIds: sections.map((s) => s.id), isSchoolWide: true };
    }
    const sectionIds = await this.headTeachers.assertHeadTeacher(user);
    return { sectionIds, isSchoolWide: false };
  }
}
