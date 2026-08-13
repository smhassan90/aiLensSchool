import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LessonStatus,
  Prisma,
  QuestionSource,
  QuestionType,
  QuizStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, paginate } from '../common/dto/pagination.dto';
import { QuizGenerationService } from '../ai/services/quiz-generation.service';
import { NotificationService } from '../notifications/notifications.service';
import { ParentsService } from '../parents/parents.service';
import {
  GenerateQuizDto,
  PublishQuizDto,
  UpdateQuizQuestionsDto,
} from './dto/quiz.dto';
import { NotificationType } from '@prisma/client';

@Injectable()
export class QuizzesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
    private readonly quizGeneration: QuizGenerationService,
    private readonly notifications: NotificationService,
    private readonly parentsService: ParentsService,
  ) {}

  async generateFromLessons(dto: GenerateQuizDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const isAdmin = this.tenant.isSchoolAdmin(user);
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId: user.id },
    });
    if (!isAdmin && !teacher) {
      throw new ForbiddenException({
        code: 'TEACHER_REQUIRED',
        message: 'Teacher profile required',
      });
    }

    if (teacher && !isAdmin) {
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

    const lessons = await this.prisma.dailyLesson.findMany({
      where: {
        schoolId,
        sectionId: dto.sectionId,
        subjectId: dto.subjectId,
        status: LessonStatus.CONFIRMED,
        date: {
          gte: new Date(`${dto.lessonDateFrom}T00:00:00.000`),
          lte: new Date(`${dto.lessonDateTo}T23:59:59.999`),
        },
      },
      orderBy: { date: 'asc' },
    });

    if (!lessons.length) {
      throw new BadRequestException({
        code: 'NO_CONFIRMED_LESSONS',
        message: 'No confirmed lessons in the selected date range',
      });
    }

    const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
    const aiQuiz = await this.quizGeneration.generate({
      schoolId,
      userId: user.id,
      lessonSummaries: lessons.map(
        (l) =>
          `${l.date.toISOString().slice(0, 10)}: ${l.aiSummary ?? l.topicName ?? l.chapterName ?? 'Lesson'}`,
      ),
      subjectName: subject?.name,
      questionCount: dto.questionCount ?? 5,
    });

    const totalMarks = aiQuiz.questions.reduce((sum, q) => sum + q.marks, 0);

    const quiz = await this.prisma.$transaction(async (tx) => {
      const created = await tx.quiz.create({
        data: {
          schoolId,
          branchId: dto.branchId,
          academicYearId: dto.academicYearId,
          sectionId: dto.sectionId,
          subjectId: dto.subjectId,
          title: dto.title ?? aiQuiz.title,
          description: aiQuiz.description,
          status: QuizStatus.DRAFT,
          createdById: user.id,
          lessonDateFrom: new Date(dto.lessonDateFrom),
          lessonDateTo: new Date(dto.lessonDateTo),
          totalMarks,
        },
      });

      for (let i = 0; i < aiQuiz.questions.length; i++) {
        const q = aiQuiz.questions[i];
        const question = await tx.quizQuestion.create({
          data: {
            quizId: created.id,
            type: q.type as QuestionType,
            questionText: q.questionText,
            marks: q.marks,
            correctAnswer: q.correctAnswer,
            order: i,
            source: QuestionSource.AI,
            included: true,
          },
        });
        if (q.options?.length) {
          await tx.quizOption.createMany({
            data: q.options.map((opt, idx) => ({
              questionId: question.id,
              optionText: opt.optionText,
              isCorrect: opt.isCorrect,
              order: idx,
            })),
          });
        }
      }

      return created;
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      branchId: dto.branchId,
      action: 'QUIZ_GENERATED',
      entityType: 'Quiz',
      entityId: quiz.id,
      metadata: { lessonCount: lessons.length, neverAutoPublished: true },
    });

    return this.findOne(quiz.id, user);
  }

  async updateQuestions(id: string, dto: UpdateQuizQuestionsDto, user: AuthUser) {
    const quiz = await this.findOne(id, user);
    if (quiz.status !== QuizStatus.DRAFT) {
      throw new BadRequestException({
        code: 'QUIZ_NOT_DRAFT',
        message: 'Only draft quizzes can be edited',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      for (const q of dto.questions) {
        await tx.quizQuestion.update({
          where: { id: q.id },
          data: {
            included: q.included,
            questionText: q.questionText,
            marks: q.marks,
            correctAnswer: q.correctAnswer,
            type: q.type,
          },
        });
      }
      const included = await tx.quizQuestion.findMany({
        where: { quizId: id, included: true },
      });
      const totalMarks = included.reduce((sum, item) => sum + Number(item.marks), 0);
      await tx.quiz.update({ where: { id }, data: { totalMarks } });
    });

    return this.findOne(id, user);
  }

  async publish(id: string, dto: PublishQuizDto, user: AuthUser) {
    const quiz = await this.findOne(id, user);
    if (quiz.status !== QuizStatus.DRAFT) {
      throw new BadRequestException({
        code: 'QUIZ_ALREADY_PUBLISHED',
        message: 'Quiz is not in draft status',
      });
    }

    const includedCount = quiz.questions.filter((q) => q.included).length;
    if (includedCount === 0) {
      throw new BadRequestException({
        code: 'NO_QUESTIONS_INCLUDED',
        message: 'Include at least one question before publishing',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const published = await tx.quiz.update({
        where: { id },
        data: {
          status: QuizStatus.PUBLISHED,
          publishedAt: new Date(),
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        },
      });

      await tx.quizAssignment.create({
        data: {
          quizId: id,
          sectionId: quiz.sectionId,
        },
      });

      return published;
    });

    const parents = await this.prisma.studentParent.findMany({
      where: {
        student: {
          enrollments: {
            some: { sectionId: quiz.sectionId, status: 'ACTIVE' },
          },
        },
      },
      include: { parent: true },
    });

    const uniqueUserIds = [...new Set(parents.map((p) => p.parent.userId))];
    for (const userId of uniqueUserIds) {
      await this.notifications.createAndQueue({
        schoolId: quiz.schoolId,
        userId,
        type: NotificationType.QUIZ_PUBLISHED,
        title: `New quiz: ${quiz.title}`,
        body: `A quiz has been published for your child's class.`,
        data: { quizId: quiz.id } as Prisma.InputJsonValue,
        deepLink: `/quizzes/${quiz.id}`,
      });
    }

    await this.audit.log({
      actorUserId: user.id,
      schoolId: quiz.schoolId,
      branchId: quiz.branchId,
      action: 'QUIZ_PUBLISHED',
      entityType: 'Quiz',
      entityId: id,
    });

    return updated;
  }

  async findAll(
    user: AuthUser,
    query: PaginationDto & { sectionId?: string; status?: QuizStatus; studentId?: string },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    if (this.tenant.isParent(user)) {
      if (!query.studentId) {
        throw new ForbiddenException({
          code: 'STUDENT_ID_REQUIRED',
          message: 'studentId is required for parent quiz list',
        });
      }
      await this.parentsService.assertParentOwnsStudent(user.id, query.studentId);
      const enrollment = await this.prisma.studentEnrollment.findFirst({
        where: { studentId: query.studentId, status: 'ACTIVE' },
      });
      if (!enrollment) {
        return paginate([], 0, page, limit);
      }
      const where: Prisma.QuizWhereInput = {
        sectionId: enrollment.sectionId,
        status: QuizStatus.PUBLISHED,
        schoolId: this.tenant.requireSchoolId(user),
      };
      const [items, total] = await this.prisma.$transaction([
        this.prisma.quiz.findMany({
          where,
          orderBy: { publishedAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: { subject: true, section: true },
        }),
        this.prisma.quiz.count({ where }),
      ]);
      return paginate(items, total, page, limit);
    }

    const schoolId = this.tenant.requireSchoolId(user);
    const where: Prisma.QuizWhereInput = {
      schoolId,
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(this.tenant.isTeacher(user) && !this.tenant.isSchoolAdmin(user)
        ? { createdById: user.id }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.quiz.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          subject: true,
          section: true,
          _count: { select: { questions: true, assignments: true } },
        },
      }),
      this.prisma.quiz.count({ where }),
    ]);
    return paginate(items, total, page, limit);
  }

  async findOne(id: string, user: AuthUser) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: {
        questions: { include: { options: true }, orderBy: { order: 'asc' } },
        subject: true,
        section: true,
        assignments: true,
      },
    });
    if (!quiz) {
      throw new NotFoundException({ code: 'QUIZ_NOT_FOUND', message: 'Quiz not found' });
    }
    this.tenant.assertSchoolAccess(user, quiz.schoolId);
    if (this.tenant.isParent(user)) {
      if (quiz.status !== QuizStatus.PUBLISHED) {
        throw new ForbiddenException({
          code: 'QUIZ_NOT_AVAILABLE',
          message: 'Quiz is not available',
        });
      }
      return {
        ...quiz,
        questions: quiz.questions.map((q) => ({
          ...q,
          correctAnswer: null,
          options: q.options.map((o) => ({ ...o, isCorrect: false })),
        })),
      };
    }
    return quiz;
  }
}
