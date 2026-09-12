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
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import { QuizGenerationService } from '../ai/services/quiz-generation.service';
import { ParentsService } from '../parents/parents.service';
import {
  GenerateQuizDto,
  PublishQuizDto,
  SubmitQuizDto,
  UpdateQuizQuestionsDto,
} from './dto/quiz.dto';
import { NotificationType } from '@prisma/client';
import { normalizeGeneratedQuestion } from '../ai/quiz-mix';

@Injectable()
export class QuizzesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
    private readonly quizGeneration: QuizGenerationService,
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

    const topicSummaries: string[] = [];
    let rangeFrom = dto.lessonDateFrom ? new Date(dto.lessonDateFrom) : undefined;
    let rangeTo = dto.lessonDateTo ? new Date(dto.lessonDateTo) : undefined;

    if (dto.homeworkIds?.length) {
      const homework = await this.prisma.homework.findMany({
        where: {
          id: { in: dto.homeworkIds },
          schoolId,
          sectionId: dto.sectionId,
          subjectId: dto.subjectId,
        },
        include: {
          lesson: {
            select: {
              topicName: true,
              chapterName: true,
              aiSummary: true,
              concepts: { select: { name: true }, take: 12 },
            },
          },
        },
        orderBy: { dueDate: 'asc' },
      });
      if (!homework.length) {
        throw new BadRequestException({
          code: 'NO_HOMEWORK_TOPICS',
          message: 'No matching homework topics were found for this class',
        });
      }
      for (const item of homework) {
        const concepts = item.lesson?.concepts?.map((c) => c.name).filter(Boolean) ?? [];
        const lessonBit = concepts.length
          ? `Key points: ${concepts.join('; ')}`
          : this.slimTopicText(item.lesson?.aiSummary ?? item.lesson?.topicName ?? '');
        topicSummaries.push(
          [`Topic: ${item.title}`, item.description, lessonBit ? `Lesson: ${lessonBit}` : '']
            .filter(Boolean)
            .join('\n'),
        );
      }
      const dueDates = homework.map((item) => item.dueDate);
      rangeFrom ??= new Date(Math.min(...dueDates.map((d) => d.getTime())));
      rangeTo ??= new Date(Math.max(...dueDates.map((d) => d.getTime())));
    }

    if (dto.lessonDateFrom && dto.lessonDateTo) {
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
        select: {
          date: true,
          topicName: true,
          chapterName: true,
          aiSummary: true,
          concepts: { select: { name: true }, take: 12 },
        },
        orderBy: { date: 'asc' },
      });
      topicSummaries.push(
        ...lessons.map((l) => {
          const concepts = l.concepts.map((c) => c.name).filter(Boolean);
          const body = concepts.length
            ? `Key points: ${concepts.join('; ')}`
            : this.slimTopicText(l.aiSummary ?? l.topicName ?? l.chapterName ?? 'Lesson');
          return `${l.date.toISOString().slice(0, 10)}: ${l.topicName ?? l.chapterName ?? 'Lesson'}\n${body}`;
        }),
      );
    }

    if (!topicSummaries.length) {
      throw new BadRequestException({
        code: 'NO_QUIZ_TOPICS',
        message: 'Select homework topics or a lesson date range to generate a quiz',
      });
    }

    const customTotal =
      (dto.mcqCount ?? 0) +
      (dto.fillBlankCount ?? 0) +
      (dto.trueFalseCount ?? dto.shortAnswerCount ?? 0);
    if (dto.quickGenerate === false && customTotal < 1) {
      throw new BadRequestException({
        code: 'QUESTION_MIX_REQUIRED',
        message: 'Choose question counts, or use Quick generate',
      });
    }

    const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
    const aiQuiz = await this.quizGeneration.generate({
      schoolId,
      userId: user.id,
      lessonSummaries: topicSummaries,
      subjectName: subject?.name,
      questionCount: dto.questionCount,
      quickGenerate: dto.quickGenerate,
      mcqCount: dto.mcqCount,
      fillBlankCount: dto.fillBlankCount,
      trueFalseCount: dto.trueFalseCount ?? dto.shortAnswerCount,
    });

    const totalMarks = aiQuiz.questions.reduce((sum, q) => sum + q.marks, 0);

    const quiz = await this.prisma.$transaction(
      async (tx) => {
      const created = await tx.quiz.create({
        data: {
          schoolId,
          branchId: dto.branchId,
          academicYearId: dto.academicYearId,
          sectionId: dto.sectionId,
          subjectId: dto.subjectId,
          title: aiQuiz.title.trim() || `${subject?.name ?? 'Class'} quiz`,
          description: aiQuiz.description,
          status: QuizStatus.DRAFT,
          createdById: user.id,
          lessonDateFrom: rangeFrom,
          lessonDateTo: rangeTo,
          totalMarks,
        },
      });

      for (let i = 0; i < aiQuiz.questions.length; i++) {
        const q = normalizeGeneratedQuestion(aiQuiz.questions[i]);
        const isChoice = q.type === 'MCQ' || q.type === 'TRUE_FALSE';
        const isFillBlank = q.type === 'FILL_IN_THE_BLANK';
        const hasMarkedOption = Boolean(q.options?.some((opt) => opt.isCorrect));
        if (!q.correctAnswer?.trim() || (!isChoice && !isFillBlank) || (isChoice && !hasMarkedOption)) {
          throw new BadRequestException({
            code: 'QUIZ_ANSWER_REQUIRED',
            message: 'Generated quiz must only include auto-gradable questions (multiple choice, fill in the blank, or true/false). Please generate again.',
          });
        }
        const question = await tx.quizQuestion.create({
          data: {
            quizId: created.id,
            type: q.type as QuestionType,
            questionText: q.questionText,
            marks: Number(q.marks) || 1,
            correctAnswer: q.correctAnswer.trim(),
            order: i,
            source: QuestionSource.AI,
            included: true,
          },
        });
        if (q.options?.length) {
          await tx.quizOption.createMany({
            data: q.options
              .map((opt, idx) => ({
                questionId: question.id,
                optionText: opt.optionText.trim(),
                isCorrect: Boolean(opt.isCorrect),
                order: idx,
              }))
              .filter((opt) => opt.optionText),
          });
        }
      }

      return created;
      },
      { maxWait: 15_000, timeout: 60_000 },
    );

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      branchId: dto.branchId,
      action: 'QUIZ_GENERATED',
      entityType: 'Quiz',
      entityId: quiz.id,
      metadata: { topicCount: topicSummaries.length, neverAutoPublished: true },
    });

    return this.findOne(quiz.id, user);
  }

  async updateQuestions(id: string, dto: UpdateQuizQuestionsDto, user: AuthUser) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        status: true,
        questions: { select: { id: true, included: true, marks: true } },
      },
    });
    if (!quiz) {
      throw new NotFoundException({ code: 'QUIZ_NOT_FOUND', message: 'Quiz not found' });
    }
    this.tenant.assertSchoolAccess(user, quiz.schoolId);
    if (quiz.status !== QuizStatus.DRAFT) {
      throw new BadRequestException({
        code: 'QUIZ_NOT_DRAFT',
        message: 'Only draft quizzes can be edited',
      });
    }

    const owned = new Map(quiz.questions.map((item) => [item.id, item]));
    const unknown = dto.questions.find((item) => !owned.has(item.id));
    if (unknown) {
      throw new BadRequestException({
        code: 'QUESTION_NOT_IN_QUIZ',
        message: 'One or more questions do not belong to this quiz',
      });
    }

    await Promise.all(
      dto.questions.map((q) =>
        this.prisma.quizQuestion.update({
          where: { id: q.id },
          data: {
            included: q.included,
            questionText: q.questionText,
            marks: q.marks,
            correctAnswer: q.correctAnswer,
            type: q.type,
          },
        }),
      ),
    );

    const totalMarks = dto.questions.reduce((sum, q) => {
      const current = owned.get(q.id);
      const included = q.included ?? current?.included ?? false;
      if (!included) return sum;
      return sum + Number(q.marks ?? current?.marks ?? 0);
    }, 0);

    const title = dto.title?.trim();
    if (dto.title !== undefined && !title) {
      throw new BadRequestException({
        code: 'TITLE_REQUIRED',
        message: 'Enter a name for this draft',
      });
    }

    await this.prisma.quiz.update({
      where: { id },
      data: {
        totalMarks,
        ...(title ? { title } : {}),
      },
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

    const dueAt = dto.immediate ? null : dto.dueAt ? new Date(dto.dueAt) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DUE_AT',
        message: 'Enter a valid date and time',
      });
    }

    const updated = await this.prisma.quiz.update({
      where: { id },
      data: {
        status: QuizStatus.PUBLISHED,
        publishedAt: new Date(),
        dueAt,
      },
    });

    await this.prisma.quizAssignment.create({
      data: {
        quizId: id,
        sectionId: quiz.sectionId,
      },
    });

    const parents = await this.prisma.studentParent.findMany({
      where: {
        student: {
          enrollments: {
            some: { sectionId: quiz.sectionId, status: 'ACTIVE' },
          },
        },
      },
      select: { parent: { select: { userId: true } } },
    });

    const uniqueUserIds = [...new Set(parents.map((p) => p.parent.userId))];
    if (uniqueUserIds.length) {
      const now = new Date();
      await this.prisma.notification.createMany({
        data: uniqueUserIds.map((userId) => ({
          schoolId: quiz.schoolId,
          userId,
          type: NotificationType.QUIZ_PUBLISHED,
          title: `New quiz: ${quiz.title}`,
          body: `A quiz has been published for your child's class.`,
          data: { quizId: quiz.id } as Prisma.InputJsonValue,
          deepLink: `/quizzes/${quiz.id}`,
          sentAt: now,
        })),
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
      const enrollment = await this.parentsService.getActiveEnrollment(user.id, query.studentId);
      if (!enrollment) {
        return paginate([], 0, page, limit);
      }
      const where: Prisma.QuizWhereInput = {
        sectionId: enrollment.sectionId,
        status: QuizStatus.PUBLISHED,
        schoolId: this.tenant.requireSchoolId(user),
      };
      const [items, total] = await pageQuery(
        (skip, take) =>
          this.prisma.quiz.findMany({
            where,
            orderBy: { publishedAt: 'desc' },
            skip,
            take,
            select: {
              id: true,
              title: true,
              description: true,
              status: true,
              totalMarks: true,
              dueAt: true,
              createdAt: true,
              publishedAt: true,
              sectionId: true,
              subjectId: true,
              subject: { select: { id: true, name: true } },
              section: { select: { id: true, name: true } },
            },
          }),
        () => this.prisma.quiz.count({ where }),
        page,
        limit,
      );
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

    const [items, total] = await pageQuery(
      (skip, take) =>
        this.prisma.quiz.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
            publishedAt: true,
            sectionId: true,
            subjectId: true,
            createdById: true,
            subject: { select: { id: true, name: true } },
            section: { select: { id: true, name: true } },
            _count: { select: { questions: true, assignments: true } },
          },
        }),
      () => this.prisma.quiz.count({ where }),
      page,
      limit,
    );
    return paginate(items, total, page, limit);
  }

  async findOne(id: string, user: AuthUser, studentId?: string) {
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
      if (!studentId) {
        throw new ForbiddenException({
          code: 'STUDENT_ID_REQUIRED',
          message: 'studentId is required for parent quiz access',
        });
      }
      await this.parentsService.assertParentChildInSection(user.id, studentId, quiz.sectionId);
      if (quiz.status !== QuizStatus.PUBLISHED) {
        throw new ForbiddenException({
          code: 'QUIZ_NOT_AVAILABLE',
          message: 'Quiz is not available',
        });
      }
      const submitted = await this.prisma.quizResult.findFirst({
        where: { quizId: quiz.id, studentId },
      });
      if (submitted) {
        return quiz;
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

  async submitAttempt(id: string, dto: SubmitQuizDto, user: AuthUser) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: {
        questions: { include: { options: true }, orderBy: { order: 'asc' } },
      },
    });
    if (!quiz) {
      throw new NotFoundException({ code: 'QUIZ_NOT_FOUND', message: 'Quiz not found' });
    }
    this.tenant.assertSchoolAccess(user, quiz.schoolId);
    if (quiz.status !== QuizStatus.PUBLISHED) {
      throw new BadRequestException({ code: 'QUIZ_NOT_AVAILABLE', message: 'Quiz is not available' });
    }
    await this.parentsService.assertParentChildInSection(user.id, dto.studentId, quiz.sectionId);

    const existing = await this.prisma.quizResult.findFirst({
      where: { quizId: id, studentId: dto.studentId },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'QUIZ_ALREADY_SUBMITTED',
        message: 'This child already has a result for this quiz',
      });
    }

    const included = quiz.questions.filter((question) => question.included);
    const answersByQuestion = new Map(dto.answers.map((answer) => [answer.questionId, answer]));
    let score = 0;
    const totalMarks = included.reduce((sum, question) => sum + Number(question.marks), 0);
    const answerRows = included.map((question) => {
      const given = answersByQuestion.get(question.id);
      const selected = given?.optionId
        ? question.options.find((option) => option.id === given.optionId)
        : undefined;
      const text = given?.answerText?.trim() ?? '';
      let isCorrect = false;
      if (question.type === QuestionType.MCQ || question.type === QuestionType.TRUE_FALSE) {
        isCorrect = Boolean(selected?.isCorrect);
        if (!isCorrect && text && question.correctAnswer) {
          isCorrect = text.toLowerCase() === question.correctAnswer.trim().toLowerCase();
        }
      } else if (question.correctAnswer) {
        isCorrect = text.toLowerCase() === question.correctAnswer.trim().toLowerCase();
      }
      const marksAwarded = isCorrect ? Number(question.marks) : 0;
      score += marksAwarded;
      return {
        questionId: question.id,
        optionId: selected?.id ?? null,
        answerText: text || selected?.optionText || null,
        isCorrect,
        marksAwarded,
      };
    });

    const percentage = totalMarks > 0 ? Number(((score / totalMarks) * 100).toFixed(2)) : 0;
    const startedAt = new Date(Date.now() - 60_000);
    const submittedAt = new Date();

    const attempt = await this.prisma.quizAttempt.create({
      data: {
        quizId: id,
        studentId: dto.studentId,
        startedAt,
        submittedAt,
        timeTaken: 60,
        answers: { create: answerRows },
      },
    });

    const result = await this.prisma.quizResult.create({
      data: {
        quizId: id,
        studentId: dto.studentId,
        attemptId: attempt.id,
        score,
        totalMarks,
        percentage,
        startedAt,
        submittedAt,
        timeTaken: 60,
      },
      include: {
        quiz: { select: { id: true, title: true, sectionId: true, subjectId: true } },
      },
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId: quiz.schoolId,
      branchId: quiz.branchId,
      action: 'QUIZ_ATTEMPT_SUBMITTED',
      entityType: 'QuizResult',
      entityId: result.id,
    });

    return result;
  }

  /** Prefer key points; otherwise keep a short slice of lesson text for the AI prompt. */
  private slimTopicText(text: string, max = 500) {
    const trimmed = text.trim();
    if (!trimmed) return '';
    if (trimmed.length <= max) return trimmed;
    return `${trimmed.slice(0, max).trim()}…`;
  }
}
