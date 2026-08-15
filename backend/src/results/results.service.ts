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
    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz) {
      throw new NotFoundException({ code: 'QUIZ_NOT_FOUND', message: 'Quiz not found' });
    }
    this.tenant.assertSchoolAccess(user, quiz.schoolId);

    const results = await this.prisma.quizResult.findMany({
      where: { quizId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, studentCode: true } },
      },
    });

    const scores = results.map((r) => Number(r.percentage));
    const avg =
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    return {
      quizId,
      title: quiz.title,
      totalStudentsAttempted: results.length,
      averagePercentage: Number(avg.toFixed(2)),
      highestPercentage: scores.length ? Math.max(...scores) : 0,
      lowestPercentage: scores.length ? Math.min(...scores) : 0,
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
        this.prisma.quizResult.findMany({
          where,
          orderBy: { submittedAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: { quiz: { select: { id: true, title: true, subjectId: true } } },
        }),
        this.prisma.quizResult.count({ where }),
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
      this.prisma.quizResult.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          student: { select: { id: true, firstName: true, lastName: true, studentCode: true } },
          quiz: { select: { id: true, title: true } },
        },
      }),
      this.prisma.quizResult.count({ where }),
    );
    return paginate(items, total, page, limit);
  }
}
