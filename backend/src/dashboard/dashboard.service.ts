import { Injectable } from '@nestjs/common';
import { StudentFeeStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
  ) {}

  async schoolSummary(user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const [studentCount, teacherCount, classCount, feeAgg, classes, latestResults] = await Promise.all([
      this.prisma.student.count({ where: { schoolId } }),
      this.prisma.teacherProfile.count({ where: { schoolId } }),
      this.prisma.grade.count({ where: { schoolId } }),
      this.prisma.studentFee.aggregate({
        where: { schoolId, status: { not: StudentFeeStatus.PAID } },
        _sum: { amount: true, paidAmount: true },
      }),
      this.prisma.grade.findMany({
        where: { schoolId },
        orderBy: { level: 'asc' },
        take: 20,
        select: {
          id: true,
          name: true,
          level: true,
          _count: { select: { sections: true, enrollments: true } },
        },
      }),
      this.prisma.quizResult.findMany({
        where: { quiz: { schoolId } },
        orderBy: { submittedAt: 'desc' },
        take: 8,
        select: {
          id: true,
          percentage: true,
          student: { select: { firstName: true, lastName: true } },
          quiz: { select: { title: true } },
        },
      }),
    ]);

    const outstanding = Number(feeAgg._sum.amount ?? 0) - Number(feeAgg._sum.paidAmount ?? 0);
    return {
      studentCount,
      teacherCount,
      classCount,
      feesOutstanding: Number(outstanding.toFixed(2)),
      classes,
      latestResults,
    };
  }

  async teacherSummary(user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const classSelect = {
      sectionId: true,
      subjectId: true,
      academicYearId: true,
      branchId: true,
      section: { select: { name: true, grade: { select: { id: true, name: true } } } },
      subject: { select: { name: true } },
    } as const;

    const [classSubjects, quizCount, homeworkCount, latestResults] = await Promise.all([
      this.prisma.classSubject.findMany({
        where: {
          OR: [{ teacher: { userId: user.id } }, { assistantTeacher: { userId: user.id } }],
        },
        select: {
          ...classSelect,
          teacher: { select: { userId: true } },
          assistantTeacher: { select: { userId: true } },
        },
      }),
      this.prisma.quiz.count({ where: { schoolId, createdById: user.id } }),
      this.prisma.homework.count({ where: { schoolId, createdById: user.id } }),
      this.prisma.quizResult.findMany({
        where: { quiz: { schoolId, createdById: user.id } },
        orderBy: { submittedAt: 'desc' },
        take: 8,
        select: {
          id: true,
          percentage: true,
          student: { select: { firstName: true, lastName: true } },
          quiz: { select: { title: true } },
        },
      }),
    ]);

    const classes = classSubjects.map((item) => ({
      sectionId: item.sectionId,
      subjectId: item.subjectId,
      academicYearId: item.academicYearId,
      branchId: item.branchId,
      sectionName: item.section.name,
      gradeName: item.section.grade?.name ?? '—',
      gradeId: item.section.grade?.id,
      subjectName: item.subject.name,
      role: item.teacher?.userId === user.id ? ('TEACHER' as const) : ('ASSISTANT' as const),
    }));

    return {
      classCount: classes.length,
      quizCount,
      homeworkCount,
      classes,
      latestResults,
    };
  }
}
