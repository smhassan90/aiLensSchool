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
  LessonSourceType,
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
import { PageOcrService } from './page-ocr.service';
import { deriveKeyPointsFromLesson, formatOcrLesson } from './lesson-text-formatter';
import {
  CreateLessonDto,
  ExtractLessonDto,
  LessonQueryDto,
  RegenerateKeyPointsDto,
  ScanLessonDto,
  UpdateLessonDto,
} from './dto/lesson.dto';
import { TeacherGradeStyleService } from '../common/services/teacher-grade-style.service';
import { applyKeyPointStyle } from './teacher-content-style';
import { LessonImageInput } from '../ai/providers/ai.provider';
import { isFakeExtractText, looksLikeRealLessonText } from '../common/extract-quality';
import { isServerlessRuntime, readEnv } from '../common/env';

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
    private readonly pageOcr: PageOcrService,
    private readonly gradeStyle: TeacherGradeStyleService,
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

  private parseOptionalInt(value?: string) {
    if (!value || value.trim() === '') return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private toLessonImages(files: Express.Multer.File[]): LessonImageInput[] {
    return files.slice(0, 5).map((file) => {
      const name = file.originalname?.toLowerCase() ?? '';
      let mime = file.mimetype?.toLowerCase() || '';
      if (!mime.startsWith('image/')) {
        if (name.endsWith('.png')) mime = 'image/png';
        else if (name.endsWith('.webp')) mime = 'image/webp';
        else mime = 'image/jpeg';
      }
      return { buffer: file.buffer, mimeType: mime, filename: file.originalname ?? 'page.jpg' };
    });
  }

  private structureFromPageText(
    ocrText: string,
    subjectName: string,
    pageFrom?: number,
    pageTo?: number,
    teacherNotes?: string,
  ) {
    const formatted = formatOcrLesson(ocrText, subjectName);
    return {
      chapterName: formatted.chapterName,
      topicName: formatted.topicName,
      summary: formatted.summary,
      concepts: formatted.concepts,
      pageFrom,
      pageTo,
      teacherNotesSuggestion: teacherNotes,
    };
  }

  private extractedTextFromSources(
    sources?: Array<{ ocrText?: string | null; manualText?: string | null }>,
  ) {
    return (
      sources
        ?.map((source) => source.ocrText?.trim() || source.manualText?.trim() || '')
        .filter(Boolean)
        .join('\n\n') ?? ''
    );
  }

  private presentLesson<
    T extends { sources?: Array<{ ocrText?: string | null; manualText?: string | null }> },
  >(lesson: T) {
    return {
      ...lesson,
      extractedText: this.extractedTextFromSources(lesson.sources),
    };
  }

  private async presentLessonWithStyle<
    T extends {
      teacherId: string;
      gradeId: string;
      sources?: Array<{ ocrText?: string | null; manualText?: string | null }>;
    },
  >(lesson: T) {
    const gradeStyle = await this.gradeStyle.get(lesson.teacherId, lesson.gradeId);
    return {
      ...this.presentLesson(lesson),
      gradeStyle,
    };
  }

  private async loadPresented(id: string) {
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
    if (!lesson) {
      throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Lesson not found' });
    }
    return this.presentLessonWithStyle(lesson);
  }

  async extractFromPhotos(dto: ExtractLessonDto, files: Express.Multer.File[], user: AuthUser) {
    if (!files?.length) {
      throw new BadRequestException({
        code: 'PHOTOS_REQUIRED',
        message: 'Upload at least one photo of the pages taught today',
      });
    }
    if (!dto?.academicYearId || !dto.gradeId || !dto.sectionId || !dto.subjectId || !dto.branchId || !dto.date) {
      throw new BadRequestException({
        code: 'CLASS_REQUIRED',
        message: 'Select a class and date before extracting the lesson',
      });
    }

    const lessonDate = new Date(dto.date);
    if (Number.isNaN(lessonDate.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: 'Lesson date is invalid',
      });
    }

    try {
      return await this.saveExtractedLesson(dto, files, user, lessonDate);
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(
        `Lesson extract failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadRequestException({
        code: 'LESSON_EXTRACT_FAILED',
        message: error instanceof Error ? error.message : 'Could not extract lesson from photos',
      });
    }
  }

  private async saveExtractedLesson(
    dto: ExtractLessonDto,
    files: Express.Multer.File[],
    user: AuthUser,
    lessonDate: Date,
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const teacher = await this.requireTeacherProfile(user.id);
    await this.assertTeacherAssignment({
      teacherId: teacher.id,
      sectionId: dto.sectionId,
      subjectId: dto.subjectId,
      academicYearId: dto.academicYearId,
    });

    const [subject, grade] = await Promise.all([
      this.prisma.subject.findUnique({ where: { id: dto.subjectId } }),
      this.prisma.grade.findUnique({ where: { id: dto.gradeId } }),
    ]);
    if (!subject || !grade) {
      throw new BadRequestException({
        code: 'CLASS_NOT_FOUND',
        message: 'Subject or grade was not found',
      });
    }

    const pageFrom = this.parseOptionalInt(dto.pageFrom);
    const pageTo = this.parseOptionalInt(dto.pageTo);
    const teacherNotes = dto.teacherNotes?.trim() || undefined;
    const canVision = Boolean(
      readEnv('OPENAI_API_KEY') ||
        readEnv('CURSOR_API_KEY') ||
        this.config.get<string>('OPENAI_API_KEY')?.trim() ||
        this.config.get<string>('CURSOR_API_KEY')?.trim(),
    );
    const uploadedText = dto.pageText?.trim() ?? '';
    const ocrText = looksLikeRealLessonText(uploadedText)
      ? uploadedText
      : await this.pageOcr.readPages(files);
    if (isServerlessRuntime() && isFakeExtractText(ocrText) && !canVision) {
      throw new BadRequestException({
        code: 'PHOTO_VISION_REQUIRED',
        message:
          'Hosted photo extract needs an AI key (OPENAI_API_KEY or CURSOR_API_KEY) on the backend Vercel project.',
      });
    }
    const images = this.toLessonImages(files);
    const ocrThin = isFakeExtractText(ocrText);
    const local = this.structureFromPageText(
      looksLikeRealLessonText(ocrText) ? ocrText : `${subject.name} lesson`,
      subject.name,
      pageFrom,
      pageTo,
      teacherNotes,
    );
    let polished;
    try {
      polished = await this.lessonProcessing.process({
        schoolId,
        userId: user.id,
        sourceText: looksLikeRealLessonText(ocrText)
          ? ocrText
          : `Read the attached ${subject.name} photos for ${grade.name}.`,
        subjectName: subject.name,
        gradeName: grade.name,
        images: ocrThin && canVision ? images : undefined,
      });
    } catch (error) {
      if (ocrThin) throw error;
      this.logger.warn(
        `Lesson AI polish failed, using page text: ${error instanceof Error ? error.message : String(error)}`,
      );
      polished = {
        chapterName: local.chapterName,
        topicName: local.topicName,
        summary: ocrText,
        concepts: local.concepts,
        teacherNotesSuggestion: local.teacherNotesSuggestion,
      };
    }
    const polishedLooksReal = looksLikeRealLessonText(polished.summary);
    if (ocrThin && !polishedLooksReal) {
      throw new BadRequestException({
        code: 'PAGE_TEXT_UNREADABLE',
        message: 'Could not extract the lesson from this photo. Please try again.',
      });
    }
    const summary = polishedLooksReal ? polished.summary : local.summary;
    const output = {
      ...local,
      chapterName: polishedLooksReal ? polished.chapterName || local.chapterName : local.chapterName,
      topicName: polishedLooksReal ? polished.topicName || local.topicName : local.topicName,
      summary,
      concepts:
        polishedLooksReal && polished.concepts.length
          ? polished.concepts
          : local.concepts.length
            ? local.concepts
            : deriveKeyPointsFromLesson(summary),
      teacherNotesSuggestion: polished.teacherNotesSuggestion ?? local.teacherNotesSuggestion,
    };
    const savedStyle = await this.gradeStyle.get(teacher.id, dto.gradeId);
    if (savedStyle?.keyPointStyle) {
      output.concepts = applyKeyPointStyle(output.concepts, savedStyle.keyPointStyle);
    }
    const extractedText = output.summary;

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
        date: lessonDate,
        chapterName: output.chapterName,
        topicName: output.topicName,
        teacherNotes: output.teacherNotesSuggestion ?? teacherNotes,
        aiSummary: output.summary,
        pageFrom: output.pageFrom ?? pageFrom,
        pageTo: output.pageTo ?? pageTo,
        status: LessonStatus.READY_FOR_REVIEW,
        sources: {
          create: {
            type: LessonSourceType.TEXTBOOK_IMAGE,
            ocrText: extractedText,
            pageFrom: output.pageFrom ?? pageFrom,
            pageTo: output.pageTo ?? pageTo,
          },
        },
        concepts: output.concepts.length
          ? { create: output.concepts.map((name) => ({ name })) }
          : undefined,
      },
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      branchId: dto.branchId,
      action: 'LESSON_EXTRACTED_FROM_PHOTOS',
      entityType: 'DailyLesson',
      entityId: lesson.id,
    });

    return this.loadPresented(lesson.id);
  }

  async updateLesson(id: string, dto: UpdateLessonDto, user: AuthUser) {
    const teacher = await this.requireTeacherProfile(user.id);
    const lesson = await this.prisma.dailyLesson.findUnique({
      where: { id },
      include: { sources: true },
    });
    if (!lesson) {
      throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Lesson not found' });
    }
    this.tenant.assertSchoolAccess(user, lesson.schoolId);
    if (lesson.teacherId !== teacher.id) {
      throw new ForbiddenException({
        code: 'LESSON_OWNER_REQUIRED',
        message: 'Only the assigned lesson teacher can update this lesson',
      });
    }
    if (lesson.status === LessonStatus.CONFIRMED) {
      throw new BadRequestException({
        code: 'LESSON_ALREADY_CONFIRMED',
        message: 'Confirmed lessons cannot be edited',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.dailyLesson.update({
        where: { id },
        data: {
          chapterName: dto.chapterName,
          topicName: dto.topicName,
          teacherNotes: dto.teacherNotes,
          aiSummary: dto.aiSummary,
          pageFrom: dto.pageFrom,
          pageTo: dto.pageTo,
        },
      });

      if (dto.extractedText !== undefined) {
        const source = lesson.sources[0];
        if (source) {
          await tx.lessonSource.update({
            where: { id: source.id },
            data: { ocrText: dto.extractedText },
          });
        } else {
          await tx.lessonSource.create({
            data: {
              lessonId: id,
              type: LessonSourceType.MANUAL_TEXT,
              ocrText: dto.extractedText,
              manualText: dto.extractedText,
            },
          });
        }
      }

      if (dto.concepts) {
        await tx.lessonConcept.deleteMany({ where: { lessonId: id } });
        const names = dto.concepts.map((name) => name.trim()).filter(Boolean);
        if (names.length) {
          await tx.lessonConcept.createMany({
            data: names.map((name) => ({ lessonId: id, name })),
          });
        }
      }
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId: lesson.schoolId,
      branchId: lesson.branchId,
      action: 'LESSON_UPDATED',
      entityType: 'DailyLesson',
      entityId: id,
    });

    return this.loadPresented(id);
  }

  async regenerateKeyPoints(id: string, dto: RegenerateKeyPointsDto, user: AuthUser) {
    const teacher = await this.requireTeacherProfile(user.id);
    const lesson = await this.prisma.dailyLesson.findUnique({
      where: { id },
      include: { sources: true, concepts: true, subject: true, grade: true },
    });
    if (!lesson) {
      throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Lesson not found' });
    }
    this.tenant.assertSchoolAccess(user, lesson.schoolId);
    if (lesson.teacherId !== teacher.id) {
      throw new ForbiddenException({
        code: 'LESSON_OWNER_REQUIRED',
        message: 'Only the assigned lesson teacher can update this lesson',
      });
    }
    if (lesson.status === LessonStatus.CONFIRMED) {
      throw new BadRequestException({
        code: 'LESSON_ALREADY_CONFIRMED',
        message: 'Confirmed lessons cannot be edited',
      });
    }

    const extractedText = this.extractedTextFromSources(lesson.sources);
    const saved = await this.gradeStyle.get(teacher.id, lesson.gradeId);
    const instruction = dto.instruction?.trim() || saved?.keyPointStyle || undefined;
    if (dto.instruction?.trim()) {
      await this.gradeStyle.remember({
        teacherId: teacher.id,
        gradeId: lesson.gradeId,
        schoolId: lesson.schoolId,
        keyPointStyle: dto.instruction,
      });
    }

    const current = lesson.concepts.map((concept) => concept.name);
    const localConcepts = current.length
      ? current
      : this.structureFromPageText(extractedText, lesson.subject.name).concepts;
    let concepts = applyKeyPointStyle(localConcepts, instruction);

    if (extractedText.trim().length > 20) {
      const polished = await this.lessonProcessing.process({
        schoolId: lesson.schoolId,
        userId: user.id,
        sourceText: [
          'Write key points only. Do not write a lesson summary.',
          instruction
            ? `Teacher instruction: ${instruction}. Follow that format exactly (for example bullet points if they asked for bullets).`
            : '',
          '',
          extractedText,
        ]
          .filter((line) => line !== '')
          .join('\n'),
        subjectName: lesson.subject.name,
        gradeName: lesson.grade.name,
      });
      const looksReal =
        polished.concepts.length > 0 &&
        !polished.concepts.some((name) => /main idea from the photographed pages/i.test(name));
      if (looksReal) {
        concepts = applyKeyPointStyle(polished.concepts, instruction);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.lessonConcept.deleteMany({ where: { lessonId: id } });
      if (concepts.length) {
        await tx.lessonConcept.createMany({
          data: concepts.map((name) => ({ lessonId: id, name })),
        });
      }
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId: lesson.schoolId,
      branchId: lesson.branchId,
      action: 'LESSON_KEY_POINTS_REGENERATED',
      entityType: 'DailyLesson',
      entityId: id,
    });

    return this.loadPresented(id);
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

    // Always process inline for now (no dedicated worker). Safe when Redis/queues are disabled on Vercel.
    void this.processLessonAsync(lesson.id).catch((err: unknown) => {
      this.logger.error(
        `Lesson async processing failed for ${lesson.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

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

    return this.loadPresented(lessonId);
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

    await this.prisma.dailyLesson.update({
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

    return this.loadPresented(id);
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
      const enrollment = await this.parentsService.getActiveEnrollment(user.id, query.studentId);
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
        (skip, take) =>
          this.prisma.dailyLesson.findMany({
            where,
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
            skip,
            take,
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
        () => this.prisma.dailyLesson.count({ where }),
        page,
        limit,
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
      (skip, take) =>
        this.prisma.dailyLesson.findMany({
          where,
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          skip,
          take,
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
      () => this.prisma.dailyLesson.count({ where }),
      page,
      limit,
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
    return this.presentLessonWithStyle(owned);
  }
}
