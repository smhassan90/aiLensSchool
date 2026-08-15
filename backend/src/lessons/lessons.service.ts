import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIRequestStatus,
  LessonStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import { LessonProcessingService } from '../ai/services/lesson-processing.service';
import { ParentsService } from '../parents/parents.service';
import { CreateLessonDto, LessonQueryDto, ScanLessonDto } from './dto/lesson.dto';

@Injectable()
export class LessonsService {
  private readonly logger = new Logger(LessonsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
    private readonly lessonProcessing: LessonProcessingService,
    private readonly config: ConfigService,
    private readonly parentsService: ParentsService,
  ) {}

  private async requireTeacherProfile(userId: string) {
    const profile = await this.prisma.teacherProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new ForbiddenException({
        code: 'TEACHER_PROFILE_REQUIRED',
        message: 'Teacher profile required',
      });
    }
    return profile;
  }

  private async assertTeacherAssignment(input: {
    teacherId: string;
    sectionId: string;
    subjectId: string;
    academicYearId: string;
  }) {
    const assignment = await this.prisma.classSubject.findFirst({
      where: {
        teacherId: input.teacherId,
        sectionId: input.sectionId,
        subjectId: input.subjectId,
        academicYearId: input.academicYearId,
      },
    });
    if (!assignment) {
      throw new ForbiddenException({
        code: 'CLASS_SUBJECT_NOT_ASSIGNED',
        message: 'Teacher is not assigned to this class/subject',
      });
    }
    return assignment;
  }

  async createManual(dto: CreateLessonDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const teacher = await this.requireTeacherProfile(user.id);
    await this.assertTeacherAssignment({
      teacherId: teacher.id,
      sectionId: dto.sectionId,
      subjectId: dto.subjectId,
      academicYearId: dto.academicYearId,
    });

    const lesson = await this.prisma.dailyLesson.create({
      data: {
        schoolId,
        branchId: dto.branchId,
        academicYearId: dto.academicYearId,
        gradeId: dto.gradeId,
        sectionId: dto.sectionId,
        subjectId: dto.subjectId,
        teacherId: teacher.id,
        createdById: user.id,
        date: new Date(dto.date),
        chapterName: dto.chapterName,
        topicName: dto.topicName,
        teacherNotes: dto.teacherNotes,
        pageFrom: dto.pageFrom,
        pageTo: dto.pageTo,
        status: LessonStatus.DRAFT,
      },
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      branchId: dto.branchId,
      action: 'LESSON_CREATED',
      entityType: 'DailyLesson',
      entityId: lesson.id,
    });

    return lesson;
  }

  async scan(dto: ScanLessonDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const teacher = await this.requireTeacherProfile(user.id);
    await this.assertTeacherAssignment({
      teacherId: teacher.id,
      sectionId: dto.sectionId,
      subjectId: dto.subjectId,
      academicYearId: dto.academicYearId,
    });

    if (!dto.manualText && !dto.fileAssetId) {
      throw new BadRequestException({
        code: 'SOURCE_REQUIRED',
        message: 'Provide manualText or fileAssetId for scan',
      });
    }

    const lesson = await this.prisma.dailyLesson.create({
      data: {
        schoolId,
        branchId: dto.branchId,
        academicYearId: dto.academicYearId,
        gradeId: dto.gradeId,
        sectionId: dto.sectionId,
        subjectId: dto.subjectId,
        teacherId: teacher.id,
        createdById: user.id,
        date: new Date(dto.date),
        pageFrom: dto.pageFrom,
        pageTo: dto.pageTo,
        status: LessonStatus.PROCESSING,
        sources: {
          create: {
            type: dto.sourceType,
            manualText: dto.manualText,
            fileAssetId: dto.fileAssetId,
            pageFrom: dto.pageFrom,
            pageTo: dto.pageTo,
          },
        },
      },
      include: { sources: true },
    });

    await this.prisma.aIJob.create({
      data: {
        lessonId: lesson.id,
        queueName: 'lesson-processing',
        status: AIRequestStatus.PENDING,
        payload: { lessonId: lesson.id },
      },
    });

    const redisUrl = this.config.get<string>('REDIS_URL');
    // Process inline when Redis is unavailable / empty — keeps E2E working without a queue worker.
    if (!redisUrl || redisUrl.trim() === '') {
      await this.processLessonAsync(lesson.id);
    } else {
      // Fire-and-forget inline processing as fallback when no dedicated worker is wired yet.
      void this.processLessonAsync(lesson.id).catch((err: unknown) => {
        this.logger.error(
          `Lesson async processing failed for ${lesson.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      branchId: dto.branchId,
      action: 'LESSON_SCAN_STARTED',
      entityType: 'DailyLesson',
      entityId: lesson.id,
    });

    return lesson;
  }

  async processLessonAsync(lessonId: string) {
    const lesson = await this.prisma.dailyLesson.findUnique({
      where: { id: lessonId },
      include: {
        sources: true,
        subject: true,
        grade: true,
      },
    });
    if (!lesson) {
      throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Lesson not found' });
    }

    const sourceText =
      lesson.sources.map((s) => s.manualText || s.ocrText || '').filter(Boolean).join('\n') ||
      'No source text provided';

    try {
      const output = await this.lessonProcessing.process({
        schoolId: lesson.schoolId,
        userId: lesson.createdById,
        sourceText,
        subjectName: lesson.subject.name,
        gradeName: lesson.grade.name,
      });

      await this.prisma.$transaction(async (tx) => {
        await tx.dailyLesson.update({
          where: { id: lessonId },
          data: {
            chapterName: output.chapterName ?? lesson.chapterName,
            topicName: output.topicName ?? lesson.topicName,
            aiSummary: output.summary,
            pageFrom: output.pageFrom ?? lesson.pageFrom,
            pageTo: output.pageTo ?? lesson.pageTo,
            teacherNotes: output.teacherNotesSuggestion ?? lesson.teacherNotes,
            status: LessonStatus.READY_FOR_REVIEW,
          },
        });

        if (output.concepts.length) {
          await tx.lessonConcept.createMany({
            data: output.concepts.map((name) => ({ lessonId, name })),
          });
        }

        await tx.aIJob.updateMany({
          where: { lessonId, status: AIRequestStatus.PENDING },
          data: {
            status: AIRequestStatus.COMPLETED,
            result: output as unknown as Prisma.InputJsonValue,
          },
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Processing failed';
      await this.prisma.dailyLesson.update({
        where: { id: lessonId },
        data: { status: LessonStatus.DRAFT },
      });
      await this.prisma.aIJob.updateMany({
        where: { lessonId, status: AIRequestStatus.PENDING },
        data: { status: AIRequestStatus.FAILED, error: message },
      });
      throw error;
    }

    return this.prisma.dailyLesson.findUnique({
      where: { id: lessonId },
      include: { concepts: true, sources: true },
    });
  }

  async confirm(id: string, user: AuthUser) {
    const teacher = await this.requireTeacherProfile(user.id);
    const lesson = await this.prisma.dailyLesson.findUnique({ where: { id } });
    if (!lesson) {
      throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Lesson not found' });
    }
    this.tenant.assertSchoolAccess(user, lesson.schoolId);

    await this.assertTeacherAssignment({
      teacherId: teacher.id,
      sectionId: lesson.sectionId,
      subjectId: lesson.subjectId,
      academicYearId: lesson.academicYearId,
    });

    if (lesson.teacherId !== teacher.id) {
      throw new ForbiddenException({
        code: 'LESSON_OWNER_REQUIRED',
        message: 'Only the assigned lesson teacher can confirm',
      });
    }

    if (
      lesson.status !== LessonStatus.DRAFT &&
      lesson.status !== LessonStatus.READY_FOR_REVIEW
    ) {
      throw new BadRequestException({
        code: 'INVALID_LESSON_STATUS',
        message: 'Lesson cannot be confirmed in current status',
      });
    }

    const updated = await this.prisma.dailyLesson.update({
      where: { id },
      data: {
        status: LessonStatus.CONFIRMED,
        confirmedAt: new Date(),
      },
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId: lesson.schoolId,
      branchId: lesson.branchId,
      action: 'LESSON_CONFIRMED',
      entityType: 'DailyLesson',
      entityId: id,
    });

    return updated;
  }

  async findAll(user: AuthUser, query: PaginationDto & LessonQueryDto) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    if (this.tenant.isParent(user) && !this.tenant.isSchoolAdmin(user)) {
      if (!query.studentId) {
        throw new ForbiddenException({
          code: 'STUDENT_ID_REQUIRED',
          message: 'studentId is required for parent lesson list',
        });
      }
      await this.parentsService.assertParentOwnsStudent(user.id, query.studentId);
      const enrollment = await this.prisma.studentEnrollment.findFirst({
        where: { studentId: query.studentId, status: 'ACTIVE' },
      });
      if (!enrollment) {
        return paginate([], 0, page, limit);
      }
      const where: Prisma.DailyLessonWhereInput = {
        schoolId,
        sectionId: enrollment.sectionId,
        status: LessonStatus.CONFIRMED,
        ...(query.date ? { date: new Date(query.date) } : {}),
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      };
      const [items, total] = await pageQuery(
        this.prisma.dailyLesson.findMany({
          where,
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            date: true,
            status: true,
            topicName: true,
            chapterName: true,
            sectionId: true,
            subjectId: true,
            gradeId: true,
            teacherId: true,
            subject: { select: { id: true, name: true } },
            section: { select: { id: true, name: true } },
            grade: { select: { id: true, name: true } },
            teacher: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
          },
        }),
        this.prisma.dailyLesson.count({ where }),
      );
      return paginate(items, total, page, limit);
    }

    let teacherFilter: Prisma.DailyLessonWhereInput = {};
    if (this.tenant.isTeacher(user) && !this.tenant.isSchoolAdmin(user)) {
      const teacher = await this.requireTeacherProfile(user.id);
      teacherFilter = { teacherId: teacher.id };
    }

    const where: Prisma.DailyLessonWhereInput = {
      schoolId,
      ...teacherFilter,
      ...(query.status ? { status: query.status } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.date ? { date: new Date(query.date) } : {}),
    };

    const [items, total] = await pageQuery(
      this.prisma.dailyLesson.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          date: true,
          status: true,
          topicName: true,
          chapterName: true,
          sectionId: true,
          subjectId: true,
          gradeId: true,
          teacherId: true,
          subject: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          grade: { select: { id: true, name: true } },
          teacher: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
        },
      }),
      this.prisma.dailyLesson.count({ where }),
    );

    return paginate(items, total, page, limit);
  }

  async findOne(id: string, user: AuthUser) {
    const lesson = await this.prisma.dailyLesson.findUnique({
      where: { id },
      include: {
        sources: true,
        concepts: true,
        subject: true,
        section: true,
        grade: true,
        teacher: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
    const owned = this.tenant.assertOwnedOrThrow(user, lesson, 'LESSON_NOT_FOUND');
    if (this.tenant.isParent(user) && !this.tenant.isSchoolAdmin(user)) {
      const enrollment = await this.prisma.studentEnrollment.findFirst({
        where: {
          status: 'ACTIVE',
          sectionId: owned.sectionId,
          student: { parents: { some: { parent: { userId: user.id } } } },
        },
      });
      if (!enrollment || owned.status !== LessonStatus.CONFIRMED) {
        throw new ForbiddenException({
          code: 'CHILD_ACCESS_DENIED',
          message: 'Parent does not have access to this lesson',
        });
      }
    }
    return owned;
  }
}
