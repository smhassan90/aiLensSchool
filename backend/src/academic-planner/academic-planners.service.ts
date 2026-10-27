import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  PlannerStatus,
  PlannerVersionOrigin,
  PlannerVersionStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { AuditService } from '../audit/audit.service';
import { dateFromIso, zonedDateIso, DEFAULT_SCHOOL_TIMEZONE } from '../teachers/teacher-checkin';
import { PlannerAccessService } from './planner-access.service';
import { defaultPlannerSettings, PlannerSettings, PlannerVersionPayload } from './planner-types';
import { CreatePlannerDto } from './dto/planner.dto';
import { plannerChapterContentHash, plannerChapterContentStatus } from './planner-content.util';

@Injectable()
export class AcademicPlannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly access: PlannerAccessService,
    private readonly audit: AuditService,
  ) {}

  async list(_user: AuthUser) {
    return [];
  }

  async create(user: AuthUser, dto: CreatePlannerDto): Promise<PlannerVersionPayload> {
    const actor = await this.access.resolveActor(user);
    const schoolId = actor.schoolId;

    const section = await this.prisma.section.findFirst({
      where: { id: dto.sectionId, schoolId },
      include: { grade: { select: { id: true, name: true, level: true } } },
    });
    if (!section) {
      throw new NotFoundException({ code: 'SECTION_NOT_FOUND', message: 'Section not found' });
    }

    const subject = await this.prisma.subject.findFirst({
      where: { id: dto.subjectId, schoolId },
      select: { id: true, name: true },
    });
    if (!subject) {
      throw new NotFoundException({ code: 'SUBJECT_NOT_FOUND', message: 'Subject not found' });
    }

    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      orderBy: { startDate: 'desc' },
    });
    if (!year) {
      throw new UnprocessableEntityException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: 'No current academic year is configured.',
      });
    }

    const classSubject = await this.prisma.classSubject.findFirst({
      where: {
        sectionId: dto.sectionId,
        subjectId: dto.subjectId,
        academicYearId: year.id,
      },
    });
    if (!classSubject) {
      throw new UnprocessableEntityException({
        code: 'CLASS_SUBJECT_NOT_FOUND',
        message: 'This subject is not assigned to the selected section for the current year.',
      });
    }

    this.access.assertCanCreate(actor, section, classSubject, dto.teacherId);

    const settingsRow = await this.prisma.schoolSettings.findFirst({
      where: { schoolId },
      select: { timezone: true },
    });
    const tz = settingsRow?.timezone ?? DEFAULT_SCHOOL_TIMEZONE;
    const todayIso = zonedDateIso(new Date(), tz);

    const startDateIso = dto.startDate ?? todayIso;
    const examDateIso = dto.examDate;
    const startDate = dateFromIso(startDateIso);
    const examDate = dateFromIso(examDateIso);

    if (startDateIso < todayIso) {
      throw new UnprocessableEntityException({
        code: 'START_DATE_INVALID',
        message: 'Start date cannot be before today.',
      });
    }
    if (startDate < year.startDate) {
      throw new UnprocessableEntityException({
        code: 'START_DATE_INVALID',
        message: 'Start date must fall within the academic year.',
      });
    }
    if (examDate <= startDate) {
      throw new UnprocessableEntityException({
        code: 'EXAM_DATE_INVALID',
        message: 'Exam date must be after the start date.',
      });
    }
    if (examDate > year.endDate) {
      throw new UnprocessableEntityException({
        code: 'EXAM_DATE_INVALID',
        message: 'Exam date must fall within the academic year.',
      });
    }

    if (dto.examConfigId) {
      const examConfig = await this.prisma.examConfig.findFirst({
        where: { id: dto.examConfigId, schoolId, academicYearId: year.id },
      });
      if (!examConfig) {
        throw new UnprocessableEntityException({
          code: 'EXAM_CONFIG_NOT_FOUND',
          message: 'Exam configuration not found for this year.',
        });
      }
    }

    const grant = await this.prisma.libraryBookGrant.findFirst({
      where: { schoolId, bookId: dto.libraryBookId, canRead: true },
    });
    if (!grant) {
      throw new UnprocessableEntityException({
        code: 'BOOK_NOT_ASSIGNED',
        message: 'This book is not available to your school.',
      });
    }

    const uniqueChapterIds = [...new Set(dto.chapterIds)];
    const chapters = await this.prisma.libraryBookChapter.findMany({
      where: { bookId: dto.libraryBookId, id: { in: uniqueChapterIds } },
    });
    if (chapters.length !== uniqueChapterIds.length) {
      throw new UnprocessableEntityException({
        code: 'CHAPTER_NOT_IN_BOOK',
        message: 'One or more chapters do not belong to the selected book.',
      });
    }
    const chapterById = new Map(chapters.map((c) => [c.id, c]));
    const orderedChapters = uniqueChapterIds.map((id) => chapterById.get(id)!);

    const baseSettings = defaultPlannerSettings(examDateIso);
    const settings: PlannerSettings = {
      ...baseSettings,
      revisionSlots: dto.settings?.revisionSlots ?? baseSettings.revisionSlots,
      minChapterStartMinutes: dto.settings?.minChapterStartMinutes ?? baseSettings.minChapterStartMinutes,
      fallbackPeriodsPerWeek: dto.settings?.fallbackPeriodsPerWeek,
      fallbackPeriodMinutes: dto.settings?.fallbackPeriodMinutes,
    };

    const title = `${section.grade.name} ${section.name} — ${subject.name}`;

    const { versionId, plannerId } = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM class_subjects WHERE id = ${classSubject.id} FOR UPDATE`;

      const overlap = await tx.academicPlanner.findFirst({
        where: {
          schoolId,
          sectionId: dto.sectionId,
          subjectId: dto.subjectId,
          academicYearId: year.id,
          status: { not: PlannerStatus.ARCHIVED },
          archivedAt: null,
          startDate: { lte: examDate },
          examDate: { gte: startDate },
        },
        select: { id: true },
      });
      if (overlap) {
        throw new ConflictException({
          error: {
            code: 'PLANNER_OVERLAP',
            message: 'Another planner already covers this class, subject and date range.',
            details: { plannerId: overlap.id },
          },
        });
      }

      const planner = await tx.academicPlanner.create({
        data: {
          schoolId,
          branchId: section.branchId,
          academicYearId: year.id,
          gradeId: section.gradeId,
          sectionId: dto.sectionId,
          subjectId: dto.subjectId,
          classSubjectId: classSubject.id,
          teacherId: dto.teacherId,
          libraryBookId: dto.libraryBookId,
          examType: dto.examType,
          examConfigId: dto.examConfigId ?? null,
          title,
          startDate,
          examDate,
          status: PlannerStatus.DRAFT,
          createdById: actor.userId,
        },
      });

      const version = await tx.academicPlannerVersion.create({
        data: {
          plannerId: planner.id,
          schoolId,
          versionNumber: 1,
          status: PlannerVersionStatus.DRAFT,
          origin: PlannerVersionOrigin.INITIAL,
          revision: 0,
          settings: settings as object,
          createdById: actor.userId,
        },
      });

      await tx.plannerChapter.createMany({
        data: orderedChapters.map((chapter, index) => {
          const contentHash = plannerChapterContentHash(chapter.publishedText, chapter.exercisesText);
          const contentStatus = plannerChapterContentStatus(chapter.publishedText, chapter.exercisesText);
          return {
            versionId: version.id,
            chapterKey: randomUUID(),
            libraryBookChapterId: chapter.id,
            sortOrder: index,
            titleSnapshot: chapter.title,
            contentHash,
            contentStatus,
            required: true,
            activitiesEnabled: false,
            activityCount: 1,
          };
        }),
      });

      await tx.academicPlanner.update({
        where: { id: planner.id },
        data: { workingVersionId: version.id },
      });

      return { versionId: version.id, plannerId: planner.id };
    });

    this.audit.log({
      actorUserId: actor.userId,
      schoolId,
      branchId: section.branchId,
      action: 'ACADEMIC_PLANNER_CREATED',
      entityType: 'AcademicPlanner',
      entityId: plannerId,
      metadata: { sectionId: dto.sectionId, subjectId: dto.subjectId, versionId },
    });

    return (await this.getVersionPayload(user, plannerId, versionId)) as PlannerVersionPayload;
  }

  async getVersionPayload(user: AuthUser, plannerId: string, versionId: string): Promise<Partial<PlannerVersionPayload>> {
    const actor = await this.access.resolveActor(user);
    const schoolId = this.tenant.requireSchoolId(user);
    const planner = await this.prisma.academicPlanner.findFirst({
      where: { id: plannerId, schoolId },
      include: {
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
        section: { select: { id: true, name: true, grade: { select: { name: true, level: true } } } },
        libraryBook: { select: { id: true, title: true } },
      },
    });
    if (!planner) {
      throw new NotFoundException({ code: 'PLANNER_NOT_FOUND', message: 'Planner not found' });
    }
    const version = await this.prisma.academicPlannerVersion.findFirst({
      where: { id: versionId, plannerId, schoolId },
      include: {
        chapters: { orderBy: { sortOrder: 'asc' } },
        activities: { orderBy: { sortOrder: 'asc' } },
        lessons: { orderBy: { sequence: 'asc' } },
      },
    });
    if (!version) {
      throw new NotFoundException({ code: 'PLANNER_VERSION_NOT_FOUND', message: 'Planner version not found' });
    }

    const chapterKeyById = new Map(version.chapters.map((c) => [c.id, c.chapterKey]));

    const settings = (version.settings ?? defaultPlannerSettings(planner.examDate.toISOString().slice(0, 10))) as Record<
      string,
      unknown
    >;

    return {
      planner: {
        id: planner.id,
        title: planner.title,
        status: planner.status,
        sectionId: planner.sectionId,
        classLabel: planner.section.grade.name,
        subject: planner.subject,
        teacher: {
          id: planner.teacher.id,
          name: `${planner.teacher.user.firstName} ${planner.teacher.user.lastName ?? ''}`.trim(),
        },
        examType: planner.examType,
        examDate: planner.examDate.toISOString().slice(0, 10),
        startDate: planner.startDate.toISOString().slice(0, 10),
        approvedVersionId: planner.approvedVersionId,
        workingVersionId: planner.workingVersionId,
        lockRevision: planner.lockRevision,
        libraryBook: planner.libraryBook,
      },
      version: {
        id: version.id,
        versionNumber: version.versionNumber,
        status: version.status,
        origin: version.origin,
        revision: version.revision,
        basedOnVersionId: version.basedOnVersionId,
        settings: settings as PlannerVersionPayload['version']['settings'],
        summary: version.summary as PlannerVersionPayload['version']['summary'],
        examRisk: version.examRisk,
        changeReason: version.changeReason,
        changeReasonNote: version.changeReasonNote,
        impact: version.impact,
        submittedAt: version.submittedAt?.toISOString() ?? null,
        decidedAt: version.decidedAt?.toISOString() ?? null,
        decisionComment: version.decisionComment,
        createdById: version.createdById,
      },
      permissions: this.access.computePermissions(actor, planner, version),
      chapters: version.chapters.map((c) => ({
        chapterKey: c.chapterKey,
        libraryBookChapterId: c.libraryBookChapterId,
        title: c.titleSnapshot,
        sortOrder: c.sortOrder,
        required: c.required,
        contentStatus: c.contentStatus,
        analysisSource: c.analysisSource,
        analysisWarnings: c.analysisWarnings,
        activitiesEnabled: c.activitiesEnabled,
        activityCount: c.activityCount,
        analysisSummary: null,
      })),
      activities: version.activities.map((a) => ({
        activityKey: a.activityKey,
        chapterKey: chapterKeyById.get(a.plannerChapterId) ?? '',
        title: a.title,
        description: a.description,
        minutes: a.minutes,
        afterPortionKey: a.afterPortionKey,
        optional: a.optional,
        source: a.source,
      })),
      lessons: version.lessons.map((l) => ({
        lessonKey: l.lessonKey,
        chapterKey: l.plannerChapterId ? chapterKeyById.get(l.plannerChapterId) ?? null : null,
        sequence: l.sequence,
        kind: l.kind,
        title: l.title,
        primaryStage: l.primaryStage,
        stages: l.stages as PlannerVersionPayload['lessons'][0]['stages'],
        objectives: l.objectives as string[],
        plannedMinutes: l.plannedMinutes,
        dependsOnKeys: l.dependsOnKeys as string[],
        date: l.scheduledDate?.toISOString().slice(0, 10) ?? null,
        periodNumber: l.periodNumber,
        startTime: l.slotStartTime,
        endTime: l.slotEndTime,
        frozen: l.frozen,
        isContinuation: l.isContinuation,
        progress: null,
      })),
      calendar: {
        from: planner.startDate.toISOString().slice(0, 10),
        to: planner.examDate.toISOString().slice(0, 10),
        lastTeachingDate: (settings.lastTeachingDate as string) ?? planner.examDate.toISOString().slice(0, 10),
        examDate: planner.examDate.toISOString().slice(0, 10),
        days: [],
      },
      warnings: [],
    };
  }
}
