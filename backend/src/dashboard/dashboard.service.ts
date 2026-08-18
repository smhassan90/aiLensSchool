import { Inject, Injectable } from '@nestjs/common';
import { AttendanceStatus, EnrollmentStatus, ExpenseCategory, StudentFeeStatus, StudentStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { AI_PROVIDER, AiProvider } from '../ai/providers/ai.provider';

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en', { month: 'short', year: '2-digit' });
}

function lastNMonthKeys(n: number) {
  const keys: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    keys.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return keys;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  async schoolSummary(user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const months = lastNMonthKeys(6);
    const rangeStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      studentCount,
      teacherCount,
      classCount,
      thisMonthFees,
      outstandingAgg,
      payments,
      expenses,
      classTeachers,
      setup,
    ] = await Promise.all([
      this.prisma.student.count({ where: { schoolId, status: StudentStatus.ACTIVE } }),
      this.prisma.teacherProfile.count({ where: { schoolId } }),
      this.prisma.grade.count({ where: { schoolId } }),
      this.prisma.feePayment.aggregate({
        where: { paidAt: { gte: monthStart, lt: nextMonth }, studentFee: { schoolId } },
        _sum: { amount: true },
      }),
      this.prisma.studentFee.aggregate({
        where: { schoolId, status: { not: StudentFeeStatus.PAID }, dueDate: { gte: monthStart, lt: nextMonth } },
        _sum: { amount: true, paidAmount: true },
      }),
      this.prisma.feePayment.findMany({
        where: { paidAt: { gte: rangeStart }, studentFee: { schoolId } },
        select: { amount: true, paidAt: true },
      }),
      this.prisma.expense.findMany({
        where: { schoolId, expenseDate: { gte: rangeStart } },
        select: { amount: true, category: true, expenseDate: true, recurrence: true },
      }),
      this.prisma.section.findMany({
        where: { schoolId },
        orderBy: [{ grade: { level: 'asc' } }, { name: 'asc' }],
        take: 40,
        select: {
          id: true,
          name: true,
          grade: { select: { id: true, name: true, level: true } },
          classTeacher: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
          _count: { select: { enrollments: true } },
          classSubjects: {
            take: 8,
            select: {
              subject: { select: { name: true } },
              teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
            },
          },
        },
      }),
      this.prisma.schoolSettings.findUnique({ where: { schoolId }, select: { setupCompleted: true } }),
    ]);

    const remainingThisMonth = Math.max(
      0,
      Number(outstandingAgg._sum.amount ?? 0) - Number(outstandingAgg._sum.paidAmount ?? 0),
    );

    const collectedByMonth: Record<string, number> = {};
    for (const key of months) collectedByMonth[key] = 0;
    for (const pay of payments) {
      const key = monthKey(pay.paidAt);
      if (key in collectedByMonth) collectedByMonth[key] += Number(pay.amount);
    }

    const expenseByMonth: Record<string, Record<string, number>> = {};
    const expenseTotals: Record<string, number> = {};
    for (const key of months) expenseByMonth[key] = {};
    for (const row of expenses) {
      const key = monthKey(row.expenseDate);
      if (!(key in expenseByMonth)) continue;
      const cat = row.category;
      expenseByMonth[key][cat] = (expenseByMonth[key][cat] ?? 0) + Number(row.amount);
      expenseTotals[cat] = (expenseTotals[cat] ?? 0) + Number(row.amount);
    }

    const financeMonths = months.map((key) => {
      const byCategory = expenseByMonth[key];
      const expenseTotal = Object.values(byCategory).reduce((sum, n) => sum + n, 0);
      return {
        key,
        label: monthLabel(key),
        collected: Number(collectedByMonth[key].toFixed(0)),
        expenseTotal: Number(expenseTotal.toFixed(0)),
        expenses: byCategory,
      };
    });

    return {
      studentCount,
      teacherCount,
      classCount,
      feesCollectedThisMonth: Number(thisMonthFees._sum.amount ?? 0),
      feesRemainingThisMonth: Number(remainingThisMonth.toFixed(2)),
      feesOutstanding: Number(remainingThisMonth.toFixed(2)),
      setupCompleted: setup?.setupCompleted ?? false,
      financeMonths,
      expenseCategories: Object.keys(expenseTotals) as ExpenseCategory[],
      classTeachers: classTeachers.map((section) => ({
        sectionId: section.id,
        className: `${section.grade.name} ${section.name}`,
        students: section._count.enrollments,
        classTeacher: section.classTeacher
          ? `${section.classTeacher.user.firstName} ${section.classTeacher.user.lastName}`
          : null,
        subjects: section.classSubjects.map((item) => ({
          subject: item.subject.name,
          teacher: item.teacher ? `${item.teacher.user.firstName} ${item.teacher.user.lastName}` : 'Unassigned',
        })),
      })),
    };
  }

  async teacherSummary(user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const since = new Date();
    since.setDate(since.getDate() - 14);

    const classSubjects = await this.prisma.classSubject.findMany({
      where: {
        OR: [{ teacher: { userId: user.id } }, { assistantTeacher: { userId: user.id } }],
      },
      select: {
        sectionId: true,
        subjectId: true,
        academicYearId: true,
        branchId: true,
        section: { select: { name: true, grade: { select: { id: true, name: true } } } },
        subject: { select: { id: true, name: true } },
        teacher: { select: { userId: true } },
        assistantTeacher: { select: { userId: true } },
      },
    });

    const gradeIds = [...new Set(classSubjects.map((item) => item.section.grade?.id).filter(Boolean))] as string[];
    const subjectIds = [...new Set(classSubjects.map((item) => item.subjectId))];
    const sectionIds = [...new Set(classSubjects.map((item) => item.sectionId))];

    const [quizCount, homeworkCount, latestResults, lessons, attendanceDays, targets, weakResults] = await Promise.all([
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
      this.prisma.dailyLesson.findMany({
        where: { schoolId, createdById: user.id, date: { gte: since } },
        select: { date: true, sectionId: true },
      }),
      this.prisma.attendance.findMany({
        where: { schoolId, sectionId: { in: sectionIds.length ? sectionIds : ['none'] }, date: { gte: since } },
        select: { date: true, sectionId: true },
        distinct: ['date', 'sectionId'],
      }),
      this.prisma.quizTarget.findMany({
        where: { schoolId, gradeId: { in: gradeIds.length ? gradeIds : ['none'] }, subjectId: { in: subjectIds.length ? subjectIds : ['none'] } },
      }),
      this.prisma.quizResult.groupBy({
        by: ['quizId'],
        where: { quiz: { schoolId, createdById: user.id } },
        _avg: { percentage: true },
        _count: { _all: true },
      }),
    ]);

    const schoolDays = this.weekdaysSince(since);
    const lessonDates = new Set(lessons.map((row) => row.date.toISOString().slice(0, 10)));
    const missingLessonDays = schoolDays.filter((day) => !lessonDates.has(day)).length;

    const attendanceSet = new Set(attendanceDays.map((row) => `${row.sectionId}:${row.date.toISOString().slice(0, 10)}`));
    const missingAttendance = sectionIds.reduce((sum, sectionId) => {
      return sum + schoolDays.filter((day) => !attendanceSet.has(`${sectionId}:${day}`)).length;
    }, 0);

    const quizTarget = targets.reduce((sum, row) => sum + row.minQuizzes, 0);
    const lowQuizzes = await this.prisma.quiz.findMany({
      where: {
        id: { in: weakResults.filter((row) => Number(row._avg.percentage ?? 100) < 50).map((row) => row.quizId) },
      },
      select: { id: true, title: true },
      take: 5,
    });

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
      quizTarget: quizTarget || null,
      missingLessonDays,
      missingAttendanceSlots: missingAttendance,
      watchQuizzes: lowQuizzes.map((quiz) => quiz.title),
      classes,
      latestResults,
      nextActions: [
        missingLessonDays > 0 ? `Add ${missingLessonDays} missing lesson${missingLessonDays === 1 ? '' : 's'} from the last 2 weeks` : 'Lessons look up to date',
        missingAttendance > 0 ? `Mark attendance for ${missingAttendance} class day${missingAttendance === 1 ? '' : 's'}` : 'Attendance is marked',
        quizTarget && quizCount < quizTarget ? `Quizzes ${quizCount}/${quizTarget} of your minimum` : 'Quiz count is on track',
      ],
    };
  }

  async teacherCoach(user: AuthUser) {
    const summary = await this.teacherSummary(user);
    const facts = [
      `Teacher: ${user.firstName} ${user.lastName}`,
      `Classes: ${summary.classCount}`,
      `Missing lessons last 14 school days: ${summary.missingLessonDays}`,
      `Missing attendance slots: ${summary.missingAttendanceSlots}`,
      `Quizzes created: ${summary.quizCount}${summary.quizTarget ? ` vs target ${summary.quizTarget}` : ''}`,
      `Homework: ${summary.homeworkCount}`,
      `Low-scoring quizzes: ${summary.watchQuizzes.join(', ') || 'none'}`,
      `Classes: ${summary.classes.map((cls) => `${cls.gradeName} ${cls.sectionName} ${cls.subjectName}`).join('; ')}`,
    ].join('\n');
    const result = await this.ai.coach({ facts });
    return result.data;
  }

  private weekdaysSince(from: Date) {
    const days: string[] = [];
    const cursor = new Date(from);
    const today = new Date();
    while (cursor <= today) {
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) days.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }
}
