import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import { ParentsService } from '../parents/parents.service';

@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly parentsService: ParentsService,
  ) {}

  async classStats(quizId: string, user: AuthUser) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        title: true,
        schoolId: true,
        sectionId: true,
        totalMarks: true,
        questions: {
          where: { included: true },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            order: true,
            questionText: true,
            type: true,
            marks: true,
            correctAnswer: true,
          },
        },
      },
    });
    if (!quiz) {
      throw new NotFoundException({ code: 'QUIZ_NOT_FOUND', message: 'Quiz not found' });
    }
    this.tenant.assertSchoolAccess(user, quiz.schoolId);

    const studentSelect = { id: true, firstName: true, lastName: true, studentCode: true } as const;

    const [enrollments, results, attempts] = await Promise.all([
      this.prisma.studentEnrollment.findMany({
        where: { sectionId: quiz.sectionId, status: 'ACTIVE' },
        select: { student: { select: studentSelect } },
      }),
      this.prisma.quizResult.findMany({
        where: { quizId },
        include: { student: { select: studentSelect } },
        orderBy: { percentage: 'desc' },
      }),
      this.prisma.quizAttempt.findMany({
        where: { quizId, submittedAt: { not: null } },
        select: {
          studentId: true,
          answers: { select: { questionId: true, isCorrect: true } },
        },
      }),
    ]);

    const scores = results.map((r) => Number(r.percentage));
    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    const bands = [
      { key: 'below40', label: 'Below 40%', min: 0, max: 39.99 },
      { key: 'from40to59', label: '40–59%', min: 40, max: 59.99 },
      { key: 'from60to79', label: '60–79%', min: 60, max: 79.99 },
      { key: 'from80', label: '80–100%', min: 80, max: 100 },
    ].map((band) => {
      const matched = results.filter((r) => {
        const pct = Number(r.percentage);
        return pct >= band.min && pct <= band.max;
      });
      return {
        key: band.key,
        label: band.label,
        count: matched.length,
        students: matched.map((r) => ({
          id: r.student.id,
          name: `${r.student.firstName} ${r.student.lastName}`.trim(),
        })),
      };
    });

    const resultByStudent = new Map(results.map((r) => [r.studentId, r]));
    const studentMap = new Map<string, (typeof enrollments)[number]['student']>();
    for (const row of enrollments) studentMap.set(row.student.id, row.student);
    for (const row of results) studentMap.set(row.student.id, row.student);

    const students = [...studentMap.values()]
      .map((student) => {
        const result = resultByStudent.get(student.id);
        return {
          studentId: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          studentCode: student.studentCode,
          score: result ? Number(result.score) : null,
          totalMarks: result ? Number(result.totalMarks) : Number(quiz.totalMarks),
          percentage: result ? Number(result.percentage) : null,
          submittedAt: result?.submittedAt ?? null,
          status: result ? 'SUBMITTED' : 'NOT_ATTEMPTED',
        };
      })
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'SUBMITTED' ? -1 : 1;
        return (b.percentage ?? -1) - (a.percentage ?? -1);
      });

    const studentName = (id: string) => {
      const student = studentMap.get(id);
      return student ? `${student.firstName} ${student.lastName}`.trim() : 'Student';
    };

    const attemptedCount = attempts.length;
    const questions = quiz.questions
      .map((question, index) => {
        let correctCount = 0;
        let wrongCount = 0;
        let unansweredCount = 0;
        const missedBy: { id: string; name: string }[] = [];

        for (const attempt of attempts) {
          const answer = attempt.answers.find((item) => item.questionId === question.id);
          if (answer?.isCorrect === true) {
            correctCount += 1;
            continue;
          }
          if (answer?.isCorrect === false) wrongCount += 1;
          else unansweredCount += 1;
          missedBy.push({ id: attempt.studentId, name: studentName(attempt.studentId) });
        }

        const missedCount = wrongCount + unansweredCount;
        const missedPercent =
          attemptedCount > 0 ? Number(((missedCount / attemptedCount) * 100).toFixed(1)) : 0;
        const correctPercent =
          attemptedCount > 0 ? Number(((correctCount / attemptedCount) * 100).toFixed(1)) : 0;

        return {
          id: question.id,
          number: index + 1,
          questionText: question.questionText,
          type: question.type,
          marks: Number(question.marks),
          correctAnswer: question.correctAnswer,
          correctCount,
          wrongCount,
          unansweredCount,
          missedCount,
          missedPercent,
          correctPercent,
          needsAttention: attemptedCount > 0 && missedPercent >= 50,
          missedBy,
        };
      })
      .sort((a, b) => b.missedPercent - a.missedPercent || b.missedCount - a.missedCount);

    return {
      quizId,
      title: quiz.title,
      totalMarks: Number(quiz.totalMarks),
      classSize: studentMap.size,
      totalStudentsAttempted: results.length,
      notAttemptedCount: students.filter((s) => s.status === 'NOT_ATTEMPTED').length,
      averagePercentage: Number(avg.toFixed(2)),
      highestPercentage: scores.length ? Math.max(...scores) : 0,
      lowestPercentage: scores.length ? Math.min(...scores) : 0,
      scoreBands: bands,
      students,
      questions,
      results,
    };
  }

  async findAll(
    user: AuthUser,
    query: PaginationDto & { quizId?: string; studentId?: string },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    if (this.tenant.isParent(user)) {
      if (!query.studentId) {
        throw new ForbiddenException({
          code: 'STUDENT_ID_REQUIRED',
          message: 'studentId is required for parent results',
        });
      }
      await this.parentsService.assertParentOwnsStudent(user.id, query.studentId);
      const where: Prisma.QuizResultWhereInput = {
        studentId: query.studentId,
        ...(query.quizId ? { quizId: query.quizId } : {}),
        quiz: { schoolId: this.tenant.requireSchoolId(user) },
      };
      const [items, total] = await pageQuery(
        (skip, take) =>
          this.prisma.quizResult.findMany({
            where,
            orderBy: { submittedAt: 'desc' },
            skip,
            take,
            include: { quiz: { select: { id: true, title: true, subjectId: true } } },
          }),
        () => this.prisma.quizResult.count({ where }),
        page,
        limit,
      );
      return paginate(items, total, page, limit);
    }

    const schoolId = this.tenant.requireSchoolId(user);
    const where: Prisma.QuizResultWhereInput = {
      quiz: { schoolId },
      ...(query.quizId ? { quizId: query.quizId } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
    };
    const [items, total] = await pageQuery(
      (skip, take) =>
        this.prisma.quizResult.findMany({
          where,
          orderBy: { submittedAt: 'desc' },
          skip,
          take,
          include: {
            student: { select: { id: true, firstName: true, lastName: true, studentCode: true } },
            quiz: { select: { id: true, title: true } },
          },
        }),
      () => this.prisma.quizResult.count({ where }),
      page,
      limit,
    );
    return paginate(items, total, page, limit);
  }
}
