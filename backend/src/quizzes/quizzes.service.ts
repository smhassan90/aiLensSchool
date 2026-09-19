import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ExamPaperReviewStatus,
  LessonStatus,
  NotificationType,
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
import { NotificationService } from '../notifications/notifications.service';
import {
  AddQuizQuestionDto,
  GenerateQuizDto,
  PublishQuizDto,
  SubmitExamPaperDto,
  SubmitQuizDto,
  UpdateQuizQuestionsDto,
} from './dto/quiz.dto';
import { examPaperLabel, EXAM_PAPER_KINDS, isExamPaperKind } from './exam-paper';
import { paperKindFromExamName } from './exam-config-map';
import { normalizeGeneratedQuestion, sectionLabelForQuestionType } from '../ai/quiz-mix';
import { deadlineBlockedMessage, isDeadlineOpen } from '../academics/exam-deadlines';

@Injectable()
export class QuizzesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
    private readonly quizGeneration: QuizGenerationService,
    private readonly parentsService: ParentsService,
    private readonly notifications: NotificationService,
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

    let examPaperAssignment: {
      id: string;
      maxMarks: number;
      submissionDueAt: Date;
      paperSubmissionUnlockedUntil: Date | null;
      examConfigId: string;
      sectionId: string;
      subjectId: string;
      releasedAt: Date | null;
      teacherId: string | null;
    } | null = null;

    if (teacher && !isAdmin) {
      const classAssignment = await this.prisma.classSubject.findFirst({
        where: {
          sectionId: dto.sectionId,
          subjectId: dto.subjectId,
          academicYearId: dto.academicYearId,
          OR: [{ teacherId: teacher.id }, { assistantTeacherId: teacher.id }],
        },
      });
      if (!classAssignment) {
        throw new ForbiddenException({
          code: 'CLASS_SUBJECT_NOT_ASSIGNED',
          message: 'Teacher is not assigned to this class/subject',
        });
      }
    }

    const examPaperRequested = isExamPaperKind(dto.paperKind) || Boolean(dto.examConfigId || dto.examPaperAssignmentId);
    if (examPaperRequested && teacher && !isAdmin) {
      if (!dto.examPaperAssignmentId) {
        throw new ForbiddenException({
          code: 'EXAM_ASSIGNMENT_REQUIRED',
          message: 'The office must assign this exam before you can generate a paper',
        });
      }
      examPaperAssignment = await this.prisma.examPaperAssignment.findFirst({
        where: {
          id: dto.examPaperAssignmentId,
          schoolId,
          releasedAt: { not: null },
        },
        select: {
          id: true,
          maxMarks: true,
          submissionDueAt: true,
          paperSubmissionUnlockedUntil: true,
          examConfigId: true,
          sectionId: true,
          subjectId: true,
          releasedAt: true,
          teacherId: true,
        },
      });
      if (!examPaperAssignment) {
        throw new ForbiddenException({
          code: 'EXAM_ASSIGNMENT_NOT_FOUND',
          message: 'This exam assignment is not available yet. Wait for the office to release it.',
        });
      }
      if (
        examPaperAssignment.teacherId &&
        teacher &&
        examPaperAssignment.teacherId !== teacher.id
      ) {
        throw new ForbiddenException({
          code: 'EXAM_ASSIGNMENT_NOT_YOURS',
          message: 'This exam was not assigned to you',
        });
      }
      if (
        !isDeadlineOpen(
          examPaperAssignment.submissionDueAt,
          examPaperAssignment.paperSubmissionUnlockedUntil,
        )
      ) {
        throw new BadRequestException({
          code: 'EXAM_PAPER_DEADLINE_PASSED',
          message: deadlineBlockedMessage('paper'),
        });
      }
      dto.sectionId = examPaperAssignment.sectionId;
      dto.subjectId = examPaperAssignment.subjectId;
      dto.examConfigId = examPaperAssignment.examConfigId;

      const existingSubmitted = await this.prisma.quiz.findFirst({
        where: {
          examPaperAssignmentId: examPaperAssignment.id,
          createdById: user.id,
          status: QuizStatus.CLOSED,
          reviewStatus: { not: ExamPaperReviewStatus.REJECTED },
        },
        select: { id: true },
      });
      if (existingSubmitted) {
        throw new BadRequestException({
          code: 'EXAM_ALREADY_SUBMITTED',
          message: 'You have already submitted this exam paper',
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

    if (dto.lessonIds?.length) {
      const lessons = await this.prisma.dailyLesson.findMany({
        where: {
          id: { in: dto.lessonIds },
          schoolId,
          sectionId: dto.sectionId,
          subjectId: dto.subjectId,
          status: LessonStatus.CONFIRMED,
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
      if (!lessons.length) {
        throw new BadRequestException({
          code: 'NO_CONFIRMED_LECTURES',
          message: 'Select confirmed lectures for this class and subject',
        });
      }
      topicSummaries.push(
        ...lessons.map((l) => {
          const concepts = l.concepts.map((c) => c.name).filter(Boolean);
          const body = concepts.length
            ? `Key points: ${concepts.join('; ')}`
            : this.slimTopicText(l.aiSummary ?? l.topicName ?? l.chapterName ?? 'Lecture');
          return `${l.date.toISOString().slice(0, 10)}: ${l.topicName ?? l.chapterName ?? 'Lecture'}\n${body}`;
        }),
      );
      rangeFrom ??= lessons[0]?.date;
      rangeTo ??= lessons[lessons.length - 1]?.date;
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
        message: 'Select lectures, homework topics, or a lesson date range',
      });
    }

    const examPaper = isExamPaperKind(dto.paperKind) || Boolean(dto.examConfigId || dto.examPaperAssignmentId);
    const customTotal =
      (dto.mcqCount ?? 0) +
      (dto.fillBlankCount ?? 0) +
      (dto.trueFalseCount ?? 0) +
      (dto.shortAnswerCount ?? dto.openEndedCount ?? 0) +
      (dto.longAnswerCount ?? 0) +
      (examPaper ? 0 : dto.shortAnswerCount ?? 0);
    if (
      examPaper &&
      (dto.shortAnswerCount ?? dto.openEndedCount ?? 0) + (dto.longAnswerCount ?? 0) > 20
    ) {
      throw new BadRequestException({
        code: 'OPEN_QUESTION_LIMIT',
        message: 'Short and long questions together cannot exceed 20 for an exam paper',
      });
    }
    if (dto.quickGenerate === false && customTotal < 1) {
      throw new BadRequestException({
        code: 'QUESTION_MIX_REQUIRED',
        message: 'Choose question counts, or use Quick generate',
      });
    }

    const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
    let examConfig: { id: string; name: string; startDate: Date | null } | null = null;
    if (examPaper && dto.examConfigId) {
      examConfig = await this.prisma.examConfig.findFirst({
        where: { id: dto.examConfigId, schoolId, academicYearId: dto.academicYearId },
        select: { id: true, name: true, startDate: true },
      });
      if (!examConfig) {
        throw new BadRequestException({
          code: 'EXAM_CONFIG_NOT_FOUND',
          message: 'Selected exam paper was not found for this year',
        });
      }
    }

    const difficulty = dto.difficulty ?? (examPaper ? 5 : undefined);

    const aiQuiz = await this.quizGeneration.generate({
      schoolId,
      userId: user.id,
      lessonSummaries: topicSummaries,
      subjectName: subject?.name,
      questionCount: dto.questionCount,
      quickGenerate: examPaper ? false : dto.quickGenerate,
      examPaper,
      difficulty,
      mcqCount: dto.mcqCount,
      fillBlankCount: dto.fillBlankCount,
      trueFalseCount: dto.trueFalseCount,
      openEndedCount: dto.openEndedCount,
      shortAnswerCount: dto.shortAnswerCount ?? dto.openEndedCount,
      longAnswerCount: dto.longAnswerCount,
      mcqMarks: dto.mcqMarks,
      trueFalseMarks: dto.trueFalseMarks,
      fillBlankMarks: dto.fillBlankMarks,
      openEndedMarks: dto.openEndedMarks,
      shortAnswerMarks: dto.shortAnswerMarks,
      longAnswerMarks: dto.longAnswerMarks,
    });

    const totalMarks = aiQuiz.questions.reduce((sum, q) => sum + q.marks, 0);

    const paperKind = examPaper
      ? examConfig
        ? paperKindFromExamName(examConfig.name)
        : dto.paperKind!
      : 'QUIZ';
    const paperTitle =
      dto.title?.trim() ||
      (examPaper
        ? `${examConfig?.name ?? examPaperLabel(paperKind)} — ${subject?.name ?? 'Subject'}`
        : aiQuiz.title.trim() || `${subject?.name ?? 'Class'} quiz`);

    const quiz = await this.prisma.$transaction(
      async (tx) => {
      const created = await tx.quiz.create({
        data: {
          schoolId,
          branchId: dto.branchId,
          academicYearId: dto.academicYearId,
          sectionId: dto.sectionId,
          subjectId: dto.subjectId,
          title: paperTitle,
          description: aiQuiz.description,
          status: QuizStatus.DRAFT,
          createdById: user.id,
          lessonDateFrom: rangeFrom,
          lessonDateTo: rangeTo,
          totalMarks,
          paperKind,
          difficulty: difficulty ?? null,
          examConfigId: examConfig?.id ?? null,
          examPaperAssignmentId: examPaperAssignment?.id ?? null,
          dueAt: examPaperAssignment?.submissionDueAt ?? examConfig?.startDate ?? null,
        },
      });

      const presentTypes = aiQuiz.questions.map((item) => String(item.type));
      for (let i = 0; i < aiQuiz.questions.length; i++) {
        const q = normalizeGeneratedQuestion(aiQuiz.questions[i]);
        const isChoice = q.type === 'MCQ' || q.type === 'TRUE_FALSE';
        const isFillBlank = q.type === 'FILL_IN_THE_BLANK';
        const isOpenEnded = q.type === 'SHORT_ANSWER' || q.type === 'LONG_ANSWER';
        const hasMarkedOption = Boolean(q.options?.some((opt) => opt.isCorrect));
        if (!examPaper) {
          if (!q.correctAnswer?.trim() || (!isChoice && !isFillBlank) || (isChoice && !hasMarkedOption)) {
            throw new BadRequestException({
              code: 'QUIZ_ANSWER_REQUIRED',
              message: 'Generated quiz must only include auto-gradable questions (multiple choice, fill in the blank, or true/false). Please generate again.',
            });
          }
        } else if (isChoice && !hasMarkedOption) {
          throw new BadRequestException({
            code: 'EXAM_CHOICE_REQUIRED',
            message: 'Multiple-choice and true/false questions need a marked correct option. Please generate again.',
          });
        } else if (!isChoice && !isFillBlank && !isOpenEnded) {
          throw new BadRequestException({
            code: 'EXAM_QUESTION_TYPE',
            message: 'Exam papers can include MCQ, true/false, and open-ended questions only.',
          });
        }
        const question = await tx.quizQuestion.create({
          data: {
            quizId: created.id,
            type: q.type as QuestionType,
            questionText: q.questionText,
            marks: Number(q.marks) || 1,
            correctAnswer: (q.correctAnswer ?? '').trim() || (examPaper ? 'See answer key after marking.' : ''),
            sectionLabel: examPaper
              ? sectionLabelForQuestionType(String(q.type), presentTypes)
              : null,
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

    const totalMarks = this.totalMarksFromUpdates(dto.questions, owned);
    const title = dto.title?.trim();
    if (dto.title !== undefined && !title) {
      throw new BadRequestException({
        code: 'TITLE_REQUIRED',
        message: 'Enter a name for this draft',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await this.applyQuestionUpdates(tx, dto.questions);
      await tx.quiz.update({
        where: { id },
        data: {
          totalMarks,
          ...(title ? { title } : {}),
        },
      });
    });

    return this.findQuizForEdit(id, user);
  }

  async addQuestion(id: string, dto: AddQuizQuestionDto, user: AuthUser) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        status: true,
        questions: { select: { order: true }, orderBy: { order: 'desc' }, take: 1 },
      },
    });
    if (!quiz) {
      throw new NotFoundException({ code: 'QUIZ_NOT_FOUND', message: 'Quiz not found' });
    }
    this.tenant.assertSchoolAccess(user, quiz.schoolId);
    if (quiz.status !== QuizStatus.DRAFT) {
      throw new BadRequestException({
        code: 'QUIZ_NOT_DRAFT',
        message: 'Only draft papers can be edited',
      });
    }

    const text = dto.questionText.trim();
    if (!text) {
      throw new BadRequestException({
        code: 'QUESTION_TEXT_REQUIRED',
        message: 'Enter the question text',
      });
    }

    const nextOrder = (quiz.questions[0]?.order ?? -1) + 1;
    const isChoice = dto.type === QuestionType.MCQ || dto.type === QuestionType.TRUE_FALSE;
    const options =
      dto.type === QuestionType.TRUE_FALSE
        ? [
            { optionText: 'TRUE', isCorrect: dto.correctAnswer?.toUpperCase() === 'TRUE' },
            { optionText: 'FALSE', isCorrect: dto.correctAnswer?.toUpperCase() === 'FALSE' },
          ]
        : dto.options ?? [];

    const question = await this.prisma.quizQuestion.create({
      data: {
        quizId: id,
        type: dto.type,
        questionText: text,
        marks: dto.marks,
        correctAnswer: dto.correctAnswer?.trim() || null,
        order: nextOrder,
        source: QuestionSource.MANUAL,
        included: true,
      },
    });

    if (isChoice && options.length) {
      await this.prisma.quizOption.createMany({
        data: options
          .map((opt, idx) => ({
            questionId: question.id,
            optionText: opt.optionText.trim(),
            isCorrect: Boolean(opt.isCorrect),
            order: idx,
          }))
          .filter((opt) => opt.optionText),
      });
    }

    await this.recalculateQuizMarks(id);
    return this.findQuizForEdit(id, user);
  }

  private async recalculateQuizMarks(quizId: string) {
    const questions = await this.prisma.quizQuestion.findMany({
      where: { quizId, included: true },
      select: { marks: true },
    });
    const totalMarks = questions.reduce((sum, q) => sum + Number(q.marks), 0);
    await this.prisma.quiz.update({ where: { id: quizId }, data: { totalMarks } });
  }

  async publish(id: string, dto: PublishQuizDto, user: AuthUser) {
    const quiz = await this.findOne(id, user);
    if (isExamPaperKind(quiz.paperKind)) {
      throw new BadRequestException({
        code: 'EXAM_NOT_PUBLISHABLE',
        message: 'Submit this paper for printout instead of publishing it to parents',
      });
    }
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
    if (uniqueUserIds.length && (dto.immediate === true || !dto.dueAt)) {
      await this.notifications.createForUsers(uniqueUserIds, {
        schoolId: quiz.schoolId,
        type: NotificationType.QUIZ_PUBLISHED,
        title: `New quiz: ${quiz.title}`,
        body: `A quiz has been published for your child's class.`,
        data: { quizId: quiz.id } as Prisma.InputJsonValue,
        deepLink: `/quiz/${quiz.id}`,
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

  async submitForPrint(id: string, user: AuthUser, dto: SubmitExamPaperDto = {}) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        branchId: true,
        status: true,
        paperKind: true,
        examPaperAssignmentId: true,
        examPaperAssignment: { select: { maxMarks: true } },
        questions: { select: { id: true, included: true, marks: true, type: true } },
      },
    });
    if (!quiz) {
      throw new NotFoundException({ code: 'QUIZ_NOT_FOUND', message: 'Quiz not found' });
    }
    this.tenant.assertSchoolAccess(user, quiz.schoolId);
    if (!isExamPaperKind(quiz.paperKind)) {
      throw new BadRequestException({
        code: 'NOT_AN_EXAM_PAPER',
        message: 'Only assessment, mid-term, and final papers can be submitted for printout',
      });
    }
    if (quiz.status !== QuizStatus.DRAFT) {
      throw new BadRequestException({
        code: 'EXAM_ALREADY_SUBMITTED',
        message: 'This paper is already submitted',
      });
    }

    const owned = new Map(quiz.questions.map((item) => [item.id, item]));
    if (dto.questions?.length) {
      const unknown = dto.questions.find((item) => !owned.has(item.id));
      if (unknown) {
        throw new BadRequestException({
          code: 'QUESTION_NOT_IN_QUIZ',
          message: 'One or more questions do not belong to this quiz',
        });
      }
    }

    const includedCount = (dto.questions ?? quiz.questions).reduce((count, q) => {
      const current = owned.get(q.id);
      const included = q.included ?? current?.included ?? false;
      return count + (included ? 1 : 0);
    }, 0);
    if (includedCount === 0) {
      throw new BadRequestException({
        code: 'NO_QUESTIONS_INCLUDED',
        message: 'Include at least one question before submitting',
      });
    }

    const totalMarks =
      dto.questions?.length
        ? this.totalMarksFromUpdates(dto.questions, owned)
        : quiz.questions.reduce(
            (sum, q) => sum + (q.included ? Number(q.marks) : 0),
            0,
          );
    const requiredMarks = quiz.examPaperAssignment?.maxMarks;
    if (requiredMarks != null && Math.round(totalMarks * 100) !== requiredMarks * 100) {
      throw new BadRequestException({
        code: 'EXAM_MARKS_MISMATCH',
        message: `Total marks must be exactly ${requiredMarks}. Your paper is ${totalMarks}. Adjust question marks before submitting.`,
      });
    }

    const submittedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      if (dto.questions?.length) {
        await this.applyQuestionUpdates(tx, dto.questions);
      }
      await tx.quiz.update({
        where: { id },
        data: {
          status: QuizStatus.CLOSED,
          reviewStatus: ExamPaperReviewStatus.PENDING_REVIEW,
          submittedAt,
          rejectionReason: null,
          totalMarks,
        },
      });
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId: quiz.schoolId,
      action: 'EXAM_PAPER_SUBMITTED',
      entityType: 'Quiz',
      entityId: id,
    });

    return this.findQuizForEdit(id, user);
  }

  async approvePaper(id: string, user: AuthUser) {
    if (!this.tenant.isSchoolAdmin(user)) {
      throw new ForbiddenException({
        code: 'ADMIN_REQUIRED',
        message: 'Only the office can approve exam papers',
      });
    }
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      select: { id: true, schoolId: true, paperKind: true, reviewStatus: true, status: true },
    });
    if (!quiz) {
      throw new NotFoundException({ code: 'QUIZ_NOT_FOUND', message: 'Quiz not found' });
    }
    this.tenant.assertSchoolAccess(user, quiz.schoolId);
    if (!isExamPaperKind(quiz.paperKind)) {
      throw new BadRequestException({ code: 'NOT_AN_EXAM_PAPER', message: 'Not an exam paper' });
    }
    if (quiz.reviewStatus !== ExamPaperReviewStatus.PENDING_REVIEW) {
      throw new BadRequestException({
        code: 'EXAM_NOT_PENDING',
        message: 'This paper is not waiting for approval',
      });
    }
    await this.prisma.quiz.update({
      where: { id },
      data: {
        reviewStatus: ExamPaperReviewStatus.APPROVED,
        reviewedById: user.id,
        reviewedAt: new Date(),
        rejectionReason: null,
      },
    });
    await this.audit.log({
      actorUserId: user.id,
      schoolId: quiz.schoolId,
      action: 'EXAM_PAPER_APPROVED',
      entityType: 'Quiz',
      entityId: id,
    });
    return this.findQuizForEdit(id, user);
  }

  async rejectPaper(id: string, reason: string, user: AuthUser) {
    if (!this.tenant.isSchoolAdmin(user)) {
      throw new ForbiddenException({
        code: 'ADMIN_REQUIRED',
        message: 'Only the office can reject exam papers',
      });
    }
    const trimmed = reason.trim();
    if (!trimmed) {
      throw new BadRequestException({
        code: 'REJECTION_REASON_REQUIRED',
        message: 'Enter a reason when rejecting a paper',
      });
    }
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      select: { id: true, schoolId: true, paperKind: true, reviewStatus: true },
    });
    if (!quiz) {
      throw new NotFoundException({ code: 'QUIZ_NOT_FOUND', message: 'Quiz not found' });
    }
    this.tenant.assertSchoolAccess(user, quiz.schoolId);
    if (!isExamPaperKind(quiz.paperKind)) {
      throw new BadRequestException({ code: 'NOT_AN_EXAM_PAPER', message: 'Not an exam paper' });
    }
    if (quiz.reviewStatus !== ExamPaperReviewStatus.PENDING_REVIEW) {
      throw new BadRequestException({
        code: 'EXAM_NOT_PENDING',
        message: 'This paper is not waiting for approval',
      });
    }
    await this.prisma.quiz.update({
      where: { id },
      data: {
        status: QuizStatus.DRAFT,
        reviewStatus: ExamPaperReviewStatus.REJECTED,
        reviewedById: user.id,
        reviewedAt: new Date(),
        rejectionReason: trimmed,
        submittedAt: null,
      },
    });
    await this.audit.log({
      actorUserId: user.id,
      schoolId: quiz.schoolId,
      action: 'EXAM_PAPER_REJECTED',
      entityType: 'Quiz',
      entityId: id,
      metadata: { reason: trimmed },
    });
    return this.findQuizForEdit(id, user);
  }

  private totalMarksFromUpdates(
    questions: UpdateQuizQuestionsDto['questions'],
    owned: Map<string, { included: boolean; marks: Prisma.Decimal }>,
  ) {
    return questions.reduce((sum, q) => {
      const current = owned.get(q.id);
      const included = q.included ?? current?.included ?? false;
      if (!included) return sum;
      return sum + Number(q.marks ?? current?.marks ?? 0);
    }, 0);
  }

  private async applyQuestionUpdates(
    tx: Prisma.TransactionClient,
    questions: UpdateQuizQuestionsDto['questions'],
  ) {
    await Promise.all(
      questions.map((q) =>
        tx.quizQuestion.update({
          where: { id: q.id },
          data: {
            ...(q.included !== undefined ? { included: q.included } : {}),
            ...(q.questionText !== undefined ? { questionText: q.questionText } : {}),
            ...(q.marks !== undefined ? { marks: q.marks } : {}),
            ...(q.correctAnswer !== undefined ? { correctAnswer: q.correctAnswer } : {}),
            ...(q.type !== undefined ? { type: q.type } : {}),
            ...(q.order !== undefined ? { order: q.order } : {}),
          },
        }),
      ),
    );
  }

  private async findQuizForEdit(id: string, user: AuthUser) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: {
        questions: { include: { options: true }, orderBy: { order: 'asc' } },
        subject: true,
        section: { include: { grade: { select: { id: true, name: true } } } },
        school: { select: { id: true, name: true } },
        examConfig: { select: { id: true, name: true, startDate: true, endDate: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!quiz) {
      throw new NotFoundException({ code: 'QUIZ_NOT_FOUND', message: 'Quiz not found' });
    }
    this.tenant.assertSchoolAccess(user, quiz.schoolId);
    return quiz;
  }

  async findAll(
    user: AuthUser,
    query: PaginationDto & { sectionId?: string; status?: QuizStatus; studentId?: string; paperKind?: string },
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
      const schoolId = this.tenant.requireSchoolId(user);
      const now = new Date();
      const where: Prisma.QuizWhereInput = {
        sectionId: enrollment.sectionId,
        status: QuizStatus.PUBLISHED,
        paperKind: 'QUIZ',
        schoolId,
        OR: [
          { dueAt: null },
          { dueAt: { gt: now } },
          { results: { some: { studentId: query.studentId } } },
        ],
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
    const examFilter =
      query.paperKind === 'EXAM'
        ? { paperKind: { in: [...EXAM_PAPER_KINDS] } }
        : query.paperKind
          ? { paperKind: query.paperKind }
          : { paperKind: 'QUIZ' };
    const where: Prisma.QuizWhereInput = {
      schoolId,
      ...examFilter,
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
            paperKind: true,
            reviewStatus: true,
            rejectionReason: true,
            difficulty: true,
            submittedAt: true,
            totalMarks: true,
            createdAt: true,
            publishedAt: true,
            dueAt: true,
            sectionId: true,
            subjectId: true,
            createdById: true,
            examConfigId: true,
            subject: { select: { id: true, name: true } },
            section: { select: { id: true, name: true, grade: { select: { id: true, name: true } } } },
            examConfig: { select: { id: true, name: true, startDate: true } },
            createdBy: { select: { firstName: true, lastName: true } },
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
        section: { include: { grade: { select: { id: true, name: true } } } },
        school: { select: { id: true, name: true } },
        examConfig: { select: { id: true, name: true, startDate: true, endDate: true } },
        examPaperAssignment: { select: { maxMarks: true } },
        assignments: true,
        createdBy: { select: { firstName: true, lastName: true } },
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
      if (quiz.status !== QuizStatus.PUBLISHED || isExamPaperKind(quiz.paperKind)) {
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
    if (quiz.dueAt && quiz.dueAt <= new Date()) {
      throw new BadRequestException({ code: 'QUIZ_EXPIRED', message: 'This quiz is no longer available' });
    }

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
