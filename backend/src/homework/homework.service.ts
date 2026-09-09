import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import { CreateHomeworkDto } from './dto/create-homework.dto';
import { SubmitHomeworkDto } from './dto/submit-homework.dto';
import { ParentsService } from '../parents/parents.service';
import {
  answerKeyFromQuestions,
  buildHomeworkQuestions,
  descriptionFromQuestions,
  HomeworkQuestionItem,
  scoreHomeworkAnswers,
  stripAnswersFromQuestions,
} from './homework-questions';

@Injectable()
export class HomeworkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
    private readonly parentsService: ParentsService,
  ) {}

  async create(dto: CreateHomeworkDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const isAdmin = this.tenant.isSchoolAdmin(user);
    if (!isAdmin) {
      const teacher = await this.prisma.teacherProfile.findUnique({
        where: { userId: user.id },
      });
      if (!teacher) {
        throw new ForbiddenException({
          code: 'TEACHER_REQUIRED',
          message: 'Only teachers can create homework',
        });
      }

      const assignment = await this.prisma.classSubject.findFirst({
        where: {
          sectionId: dto.sectionId,
          subjectId: dto.subjectId,
          academicYearId: dto.academicYearId,
          OR: [{ teacherId: teacher.id }, { assistantTeacherId: teacher.id }],
        },
      });
      if (!assignment) {
        throw new ForbiddenException({
          code: 'CLASS_SUBJECT_NOT_ASSIGNED',
          message: 'Teacher is not assigned to this class/subject',
        });
      }
    }

    const questions = this.resolveQuestions(dto);
    const homework = await this.prisma.homework.create({
      data: {
        schoolId,
        branchId: dto.branchId,
        academicYearId: dto.academicYearId,
        sectionId: dto.sectionId,
        subjectId: dto.subjectId,
        lessonId: dto.lessonId,
        createdById: user.id,
        title: dto.title,
        description: dto.description?.trim() || descriptionFromQuestions(questions) || undefined,
        answerKey: dto.answerKey?.trim() || answerKeyFromQuestions(questions) || undefined,
        questionsJson: questions.length
          ? (questions as unknown as Prisma.InputJsonValue)
          : undefined,
        dueDate: new Date(dto.dueDate),
        publishedAt: new Date(),
      },
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      branchId: dto.branchId,
      action: 'HOMEWORK_CREATED',
      entityType: 'Homework',
      entityId: homework.id,
    });

    return homework;
  }

  private resolveQuestions(dto: CreateHomeworkDto): HomeworkQuestionItem[] {
    if (Array.isArray(dto.questionsJson) && dto.questionsJson.length) {
      return buildHomeworkQuestions(dto.questionsJson as never, []);
    }
    return [];
  }

  /** Parents/students never receive the teacher answer key. */
  private forParentView(
    homework: {
      answerKey?: string | null;
      questionsJson?: Prisma.JsonValue | null;
      [key: string]: unknown;
    },
    result?: {
      id: string;
      score: Prisma.Decimal | number;
      totalMarks: Prisma.Decimal | number;
      percentage: Prisma.Decimal | number;
      submittedAt: Date;
      answersJson?: Prisma.JsonValue;
    } | null,
  ) {
    const { answerKey: _answerKey, questionsJson, ...safe } = homework;
    const questions = Array.isArray(questionsJson)
      ? stripAnswersFromQuestions(questionsJson as unknown as HomeworkQuestionItem[])
      : [];
    return {
      ...safe,
      questions,
      result: result
        ? {
            id: result.id,
            score: Number(result.score),
            totalMarks: Number(result.totalMarks),
            percentage: Number(result.percentage),
            submittedAt: result.submittedAt,
            answers: result.answersJson,
          }
        : null,
    };
  }

  async findAll(
    user: AuthUser,
    query: PaginationDto & { sectionId?: string; subjectId?: string; studentId?: string },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    if (this.tenant.isParent(user)) {
      if (!query.studentId) {
        throw new ForbiddenException({
          code: 'STUDENT_ID_REQUIRED',
          message: 'studentId is required for parent homework list',
        });
      }
      await this.parentsService.assertParentOwnsStudent(user.id, query.studentId);
      const enrollment = await this.parentsService.getActiveEnrollment(user.id, query.studentId);
      if (!enrollment) {
        return paginate([], 0, page, limit);
      }
      const where: Prisma.HomeworkWhereInput = {
        sectionId: enrollment.sectionId,
        schoolId: this.tenant.requireSchoolId(user),
      };
      const [items, total] = await pageQuery(
        (skip, take) =>
          this.prisma.homework.findMany({
            where,
            orderBy: { dueDate: 'desc' },
            skip,
            take,
            select: {
              id: true,
              title: true,
              description: true,
              dueDate: true,
              publishedAt: true,
              sectionId: true,
              subjectId: true,
              lessonId: true,
              createdAt: true,
              subject: { select: { id: true, name: true } },
              section: { select: { id: true, name: true } },
              results: {
                where: { studentId: query.studentId },
                select: {
                  id: true,
                  score: true,
                  totalMarks: true,
                  percentage: true,
                  submittedAt: true,
                },
                take: 1,
              },
            },
          }),
        () => this.prisma.homework.count({ where }),
        page,
        limit,
      );
      return paginate(
        items.map((item) => {
          const { results, ...rest } = item;
          return {
            ...rest,
            result: results[0]
              ? {
                  id: results[0].id,
                  score: Number(results[0].score),
                  totalMarks: Number(results[0].totalMarks),
                  percentage: Number(results[0].percentage),
                  submittedAt: results[0].submittedAt,
                }
              : null,
          };
        }),
        total,
        page,
        limit,
      );
    }

    const schoolId = this.tenant.requireSchoolId(user);
    const where: Prisma.HomeworkWhereInput = {
      schoolId,
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(this.tenant.isTeacher(user) && !this.tenant.isSchoolAdmin(user)
        ? { createdById: user.id }
        : {}),
    };

    const [items, total] = await pageQuery(
      (skip, take) =>
        this.prisma.homework.findMany({
          where,
          orderBy: { dueDate: 'desc' },
          skip,
          take,
          select: {
            id: true,
            title: true,
            dueDate: true,
            sectionId: true,
            subjectId: true,
            lessonId: true,
            createdAt: true,
            subject: { select: { id: true, name: true } },
            section: { select: { id: true, name: true } },
          },
        }),
      () => this.prisma.homework.count({ where }),
      page,
      limit,
    );
    return paginate(items, total, page, limit);
  }

  async findOne(id: string, user: AuthUser, studentId?: string) {
    const homework = await this.prisma.homework.findUnique({
      where: { id },
      include: { subject: true, section: true, attachments: true },
    });
    if (!homework) {
      throw new NotFoundException({ code: 'HOMEWORK_NOT_FOUND', message: 'Homework not found' });
    }
    this.tenant.assertSchoolAccess(user, homework.schoolId);
    if (this.tenant.isParent(user)) {
      if (!studentId) {
        throw new ForbiddenException({
          code: 'STUDENT_ID_REQUIRED',
          message: 'studentId is required for parent homework access',
        });
      }
      await this.parentsService.assertParentChildInSection(user.id, studentId, homework.sectionId);
      const result = await this.prisma.homeworkResult.findUnique({
        where: { homeworkId_studentId: { homeworkId: id, studentId } },
      });
      return this.forParentView(homework, result);
    }
    return homework;
  }

  async submit(id: string, dto: SubmitHomeworkDto, user: AuthUser) {
    const homework = await this.prisma.homework.findUnique({ where: { id } });
    if (!homework) {
      throw new NotFoundException({ code: 'HOMEWORK_NOT_FOUND', message: 'Homework not found' });
    }
    this.tenant.assertSchoolAccess(user, homework.schoolId);
    await this.parentsService.assertParentChildInSection(user.id, dto.studentId, homework.sectionId);

    const questions = Array.isArray(homework.questionsJson)
      ? (homework.questionsJson as unknown as HomeworkQuestionItem[])
      : [];
    if (!questions.length) {
      throw new BadRequestException({
        code: 'HOMEWORK_NOT_AUTO_GRADABLE',
        message: 'This homework has no auto-gradable questions yet',
      });
    }

    const existing = await this.prisma.homeworkResult.findUnique({
      where: { homeworkId_studentId: { homeworkId: id, studentId: dto.studentId } },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'HOMEWORK_ALREADY_SUBMITTED',
        message: 'This child already submitted this homework',
      });
    }

    const scored = scoreHomeworkAnswers(questions, dto.answers ?? []);
    const result = await this.prisma.homeworkResult.create({
      data: {
        homeworkId: id,
        studentId: dto.studentId,
        score: scored.score,
        totalMarks: scored.totalMarks,
        percentage: scored.percentage,
        answersJson: scored.answerRows as unknown as Prisma.InputJsonValue,
      },
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId: homework.schoolId,
      branchId: homework.branchId,
      action: 'HOMEWORK_SUBMITTED',
      entityType: 'HomeworkResult',
      entityId: result.id,
      metadata: { homeworkId: id, studentId: dto.studentId, score: scored.score },
    });

    return {
      id: result.id,
      homeworkId: id,
      studentId: dto.studentId,
      score: scored.score,
      totalMarks: scored.totalMarks,
      percentage: scored.percentage,
      submittedAt: result.submittedAt,
      answers: scored.answerRows,
      title: homework.title,
    };
  }
}
