import { Inject, Injectable } from '@nestjs/common';
import {
  AttendanceStatus,
  EnrollmentStatus,
  ExamPaperReviewStatus,
  ExpenseCategory,
  QuizStatus,
  StudentFeeStatus,
  StudentStatus,
  TeacherStatus,
} from '@prisma/client';
import { EXAM_PAPER_KINDS } from '../quizzes/exam-paper';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { MemoryCacheService } from '../common/services/memory-cache.service';
import { AuthUser } from '../common/types/auth-user.type';
import { FAST_AI_PROVIDER, AiProvider } from '../ai/providers/ai.provider';
import { teacherDisplayName } from '../common/utils/person-name';
import {
  dateFromIso,
  finalizeTeacherAbsences,
  zonedDateIso,
} from '../teachers/teacher-checkin';

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
    private readonly cache: MemoryCacheService,
    @Inject(FAST_AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  async schoolSummary(user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const months = lastNMonthKeys(6);
    const rangeStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const setup = await this.prisma.schoolSettings.findUnique({
      where: { schoolId },
      select: { setupCompleted: true, timezone: true, examSubmissionDaysBefore: true },
    });
    const todayIso = zonedDateIso(now, setup?.timezone || 'Asia/Karachi');
    await finalizeTeacherAbsences(this.prisma, schoolId, todayIso, now);
    const today = dateFromIso(todayIso);
    const [
      studentCount,
      teacherCount,
      classCount,
      thisMonthFees,
      outstandingAgg,
      payments,
      expenses,
      classTeachers,
      attendanceTodayRows,
      teacherAttendanceTodayRows,
    ] = await Promise.all([
      this.prisma.student.count({ where: { schoolId, status: StudentStatus.ACTIVE } }),
      this.prisma.teacherProfile.count({ where: { schoolId, status: TeacherStatus.ACTIVE } }),
      this.prisma.grade.count({ where: { schoolId } }),
      this.prisma.feePayment.aggregate({
        where: { paidAt: { gte: monthStart, lt: nextMonth }, studentFee: { schoolId } },
        _sum: { amount: true },
      }),
      this.prisma.studentFee.aggregate({
        where: {
          schoolId,
          status: { in: [StudentFeeStatus.DUE, StudentFeeStatus.PARTIAL] },
          dueDate: { gte: monthStart, lt: nextMonth },
        },
        _sum: { amount: true, paidAmount: true, discountAmount: true },
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
          classTeacher: {
            select: { id: true, gender: true, user: { select: { firstName: true, lastName: true } } },
          },
          _count: { select: { enrollments: { where: { status: EnrollmentStatus.ACTIVE } } } },
          classSubjects: {
            take: 8,
            select: {
              subject: { select: { name: true } },
              teacher: {
                select: { gender: true, user: { select: { firstName: true, lastName: true } } },
              },
            },
          },
        },
      }),
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: { schoolId, date: today },
        _count: { _all: true },
      }),
      this.prisma.teacherAttendance.groupBy({
        by: ['status'],
        where: { schoolId, date: today },
        _count: { _all: true },
      }),
    ]);

    const attendanceToday = { marked: 0, present: 0, absent: 0, late: 0, rate: 0 };
    for (const row of attendanceTodayRows) {
      const count = row._count._all;
      attendanceToday.marked += count;
      if (row.status === AttendanceStatus.PRESENT) attendanceToday.present = count;
      if (row.status === AttendanceStatus.ABSENT) attendanceToday.absent = count;
      if (row.status === AttendanceStatus.LATE) attendanceToday.late = count;
    }
    const presentLike = attendanceToday.present + attendanceToday.late;
    attendanceToday.rate = attendanceToday.marked
      ? Number(((presentLike / attendanceToday.marked) * 100).toFixed(1))
      : 0;

    const teacherAttendanceToday = { marked: 0, present: 0, absent: 0 };
    for (const row of teacherAttendanceTodayRows) {
      const count = row._count._all;
      teacherAttendanceToday.marked += count;
      if (row.status === AttendanceStatus.PRESENT || row.status === AttendanceStatus.LATE) {
        teacherAttendanceToday.present += count;
      }
      if (row.status === AttendanceStatus.ABSENT) teacherAttendanceToday.absent = count;
    }

    const remainingThisMonth = Math.max(
      0,
      Number(outstandingAgg._sum.amount ?? 0) -
        Number(outstandingAgg._sum.paidAmount ?? 0) -
        Number(outstandingAgg._sum.discountAmount ?? 0),
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

    const examPaperSubmissions = await this.buildExamPaperSubmissions(
      schoolId,
      setup?.examSubmissionDaysBefore ?? 5,
    );

    return {
      studentCount,
      teacherCount,
      classCount,
      feesCollectedThisMonth: Number(thisMonthFees._sum.amount ?? 0),
      feesRemainingThisMonth: Number(remainingThisMonth.toFixed(2)),
      feesOutstanding: Number(remainingThisMonth.toFixed(2)),
      setupCompleted: setup?.setupCompleted ?? false,
      attendanceToday,
      teacherAttendanceToday,
      financeMonths,
      expenseCategories: Object.keys(expenseTotals) as ExpenseCategory[],
      examPaperSubmissions,
      classTeachers: classTeachers.map((section) => ({
        sectionId: section.id,
        gradeId: section.grade.id,
        className: `${section.grade.name} ${section.name}`,
        students: section._count.enrollments,
        classTeacherId: section.classTeacher?.id ?? null,
        classTeacher: section.classTeacher
          ? teacherDisplayName(
              section.classTeacher.user.firstName,
              section.classTeacher.user.lastName,
              section.classTeacher.gender,
            )
          : null,
        subjects: section.classSubjects.map((item) => ({
          subject: item.subject.name,
          teacher: item.teacher
            ? teacherDisplayName(item.teacher.user.firstName, item.teacher.user.lastName, item.teacher.gender)
            : 'Unassigned',
        })),
      })),
    };
  }

  private async buildExamPaperSubmissions(schoolId: string, submissionDaysBefore: number) {
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      orderBy: { startDate: 'desc' },
      select: { id: true },
    });
    if (!year) {
      return {
        submissionDaysBefore,
        focusExam: null,
        submitted: 0,
        expected: 0,
        pendingTeachers: [] as Array<{
          teacherName: string;
          subject: string;
          className: string;
          examName: string;
          deadline: string | null;
        }>,
      };
    }

    const configs = await this.prisma.examConfig.findMany({
      where: { schoolId, academicYearId: year.id, startDate: { not: null } },
      orderBy: { startDate: 'asc' },
      select: { id: true, name: true, startDate: true },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const focusExam =
      configs.find((cfg) => cfg.startDate && cfg.startDate >= today) ??
      configs.filter((cfg) => cfg.startDate).at(-1) ??
      null;

    if (!focusExam?.startDate) {
      return {
        submissionDaysBefore,
        focusExam: null,
        submitted: 0,
        expected: 0,
        pendingTeachers: [],
      };
    }

    const deadline = new Date(focusExam.startDate);
    deadline.setDate(deadline.getDate() - submissionDaysBefore);

    const assignments = await this.prisma.classSubject.findMany({
      where: {
        section: { schoolId },
        academicYearId: year.id,
        teacherId: { not: null },
      },
      select: {
        sectionId: true,
        subjectId: true,
        section: { select: { name: true, grade: { select: { name: true } } } },
        subject: { select: { name: true } },
        teacher: {
          select: {
            userId: true,
            gender: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    const submittedPapers = await this.prisma.quiz.findMany({
      where: {
        schoolId,
        academicYearId: year.id,
        examConfigId: focusExam.id,
        status: QuizStatus.CLOSED,
        paperKind: { in: [...EXAM_PAPER_KINDS] },
      },
      select: { createdById: true, sectionId: true, subjectId: true },
    });

    const submittedKeys = new Set(
      submittedPapers.map((row) => `${row.createdById}:${row.sectionId}:${row.subjectId}`),
    );

    const pendingTeachers: Array<{
      teacherName: string;
      subject: string;
      className: string;
      examName: string;
      deadline: string | null;
    }> = [];

    for (const row of assignments) {
      if (!row.teacher?.userId) continue;
      const key = `${row.teacher.userId}:${row.sectionId}:${row.subjectId}`;
      if (submittedKeys.has(key)) continue;
      pendingTeachers.push({
        teacherName: teacherDisplayName(
          row.teacher.user.firstName,
          row.teacher.user.lastName,
          row.teacher.gender,
        ),
        subject: row.subject.name,
        className: `${row.section.grade.name} ${row.section.name}`,
        examName: focusExam.name,
        deadline: deadline.toISOString().slice(0, 10),
      });
    }

    return {
      submissionDaysBefore,
      focusExam: {
        id: focusExam.id,
        name: focusExam.name,
        examDate: focusExam.startDate.toISOString().slice(0, 10),
        deadline: deadline.toISOString().slice(0, 10),
      },
      submitted: submittedKeys.size,
      expected: assignments.length,
      pendingTeachers,
    };
  }

  async teacherSummary(user: AuthUser) {
    return this.cache.getOrSet(`teacher:summary:${user.id}`, 60_000, () => this.loadTeacherSummary(user));
  }

  private async loadTeacherSummary(user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const since = new Date();
    since.setDate(since.getDate() - 14);
    const sinceDate = since.toISOString().slice(0, 10);

    // One parallel batch against the remote DB — avoid waiting on classes before other queries.
    const [
      classSubjects,
      classTeacherSections,
      quizCount,
      homeworkCount,
      latestResults,
      lessons,
      attendanceDays,
      targetRows,
      lowQuizzes,
    ] = await Promise.all([
      this.prisma.classSubject.findMany({
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
      }),
      this.prisma.section.findMany({
        where: { schoolId, classTeacher: { userId: user.id } },
        select: {
          id: true,
          name: true,
          grade: { select: { id: true, name: true } },
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
      this.prisma.dailyLesson.findMany({
        where: { schoolId, createdById: user.id, date: { gte: since } },
        select: { date: true, sectionId: true, subjectId: true },
      }),
      this.prisma.$queryRaw<Array<{ date: Date; sectionId: string }>>`
        SELECT DISTINCT a.date AS date, a.section_id AS sectionId
        FROM attendances a
        INNER JOIN sections s ON s.id = a.section_id
        INNER JOIN teacher_profiles tp ON tp.id = s.class_teacher_id
        WHERE a.school_id = ${schoolId}
          AND a.date >= ${sinceDate}
          AND tp.user_id = ${user.id}
      `,
      this.prisma.$queryRaw<Array<{ minQuizzes: number }>>`
        SELECT qt.min_quizzes AS minQuizzes
        FROM quiz_targets qt
        WHERE qt.school_id = ${schoolId}
          AND EXISTS (
            SELECT 1
            FROM class_subjects cs
            INNER JOIN sections s ON s.id = cs.section_id AND s.grade_id = qt.grade_id
            LEFT JOIN teacher_profiles tp ON tp.id = cs.teacher_id
            LEFT JOIN teacher_profiles atp ON atp.id = cs.assistant_teacher_id
            WHERE cs.subject_id = qt.subject_id
              AND (tp.user_id = ${user.id} OR atp.user_id = ${user.id})
          )
      `,
      this.prisma.$queryRaw<Array<{ title: string }>>`
        SELECT q.title AS title
        FROM quizzes q
        INNER JOIN quiz_results r ON r.quiz_id = q.id
        WHERE q.school_id = ${schoolId} AND q.created_by_id = ${user.id}
        GROUP BY q.id, q.title
        HAVING AVG(r.percentage) < 50
        ORDER BY AVG(r.percentage) ASC
        LIMIT 5
      `,
    ]);

    const schoolDays = this.weekdaysSince(since);
    const lessonKeys = new Set(
      lessons.map((row) => `${row.sectionId}:${row.subjectId}:${row.date.toISOString().slice(0, 10)}`),
    );
    const attendanceSet = new Set(
      attendanceDays.map((row) => {
        const day =
          row.date instanceof Date
            ? row.date.toISOString().slice(0, 10)
            : String(row.date).slice(0, 10);
        return `${row.sectionId}:${day}`;
      }),
    );

    const lessonByClass = classSubjects.map((item) => {
      const days = schoolDays.map((day) => lessonKeys.has(`${item.sectionId}:${item.subjectId}:${day}`));
      const done = days.filter(Boolean).length;
      return {
        label: `${item.section.grade?.name ?? ''} ${item.section.name} · ${item.subject.name}`.trim(),
        done,
        expected: schoolDays.length,
        days,
      };
    });

    const uniqueSections = classTeacherSections.map((section) => ({
      sectionId: section.id,
      label: `${section.grade?.name ?? ''} ${section.name}`.trim(),
    }));
    const attendanceByClass = uniqueSections.map((section) => {
      const days = schoolDays.map((day) => attendanceSet.has(`${section.sectionId}:${day}`));
      const done = days.filter(Boolean).length;
      return {
        label: section.label,
        done,
        expected: schoolDays.length,
        days,
      };
    });

    const lessonHeat = schoolDays.map(
      (_, index) =>
        classSubjects.length
          ? lessonByClass.filter((row) => row.days[index]).length / classSubjects.length
          : 1,
    );
    const attendanceHeat = schoolDays.map(
      (_, index) =>
        uniqueSections.length
          ? attendanceByClass.filter((row) => row.days[index]).length / uniqueSections.length
          : 1,
    );

    const expectedLessonSlots = lessonByClass.reduce((sum, row) => sum + row.expected, 0);
    const doneLessonSlots = lessonByClass.reduce((sum, row) => sum + row.done, 0);
    const expectedAttendanceSlots = attendanceByClass.reduce((sum, row) => sum + row.expected, 0);
    const doneAttendanceSlots = attendanceByClass.reduce((sum, row) => sum + row.done, 0);
    const missingLessonDays = Math.max(0, expectedLessonSlots - doneLessonSlots);
    const missingAttendance = Math.max(0, expectedAttendanceSlots - doneAttendanceSlots);

    const quizTarget = targetRows.reduce((sum, row) => sum + Number(row.minQuizzes), 0);

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

    const isClassTeacher = uniqueSections.length > 0;

    const teacherProfile = await this.prisma.teacherProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    let examPaperPendingCount = 0;
    const examPaperPending: Array<{
      assignmentId: string;
      examName: string;
      className: string;
      subjectName: string;
      submissionDueAt: string;
      maxMarks: number;
    }> = [];
    if (teacherProfile) {
      const year = await this.prisma.academicYear.findFirst({
        where: { schoolId, isCurrent: true },
        orderBy: { startDate: 'desc' },
        select: { id: true },
      });
      if (year) {
        const teachKeys = new Set(
          classSubjects.map((row) => `${row.sectionId}:${row.subjectId}`),
        );
        const pendingAssignments = await this.prisma.examPaperAssignment.findMany({
          where: {
            schoolId,
            releasedAt: { not: null },
            examConfig: { academicYearId: year.id },
            OR: [{ teacherId: teacherProfile.id }, { teacherId: null }],
          },
          include: {
            examConfig: { select: { name: true } },
            section: { select: { name: true, grade: { select: { name: true } } } },
            subject: { select: { name: true } },
            quizzes: {
              where: { createdById: user.id, paperKind: { in: [...EXAM_PAPER_KINDS] } },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { status: true, reviewStatus: true },
            },
          },
        });
        for (const row of pendingAssignments) {
          if (!teachKeys.has(`${row.sectionId}:${row.subjectId}`)) continue;
          if (row.teacherId && row.teacherId !== teacherProfile.id) continue;
          const latest = row.quizzes[0];
          const submitted =
            latest?.status === QuizStatus.CLOSED &&
            latest.reviewStatus !== ExamPaperReviewStatus.REJECTED;
          if (submitted) continue;
          examPaperPendingCount += 1;
          examPaperPending.push({
            assignmentId: row.id,
            examName: row.examConfig.name,
            className: `${row.section.grade.name} ${row.section.name}`,
            subjectName: row.subject.name,
            submissionDueAt: row.submissionDueAt.toISOString(),
            maxMarks: row.maxMarks,
          });
        }
      }
    }

    return {
      classCount: classes.length,
      quizCount,
      homeworkCount,
      quizTarget: quizTarget || null,
      missingLessonDays,
      missingAttendanceSlots: missingAttendance,
      expectedLessonSlots,
      doneLessonSlots,
      expectedAttendanceSlots,
      doneAttendanceSlots,
      isClassTeacher,
      windowDays: schoolDays,
      lessonHeat,
      attendanceHeat,
      lessonByClass,
      attendanceByClass,
      watchQuizzes: lowQuizzes.map((quiz) => quiz.title),
      classes,
      latestResults,
      examPaperPendingCount,
      examPaperPending,
      nextActions: [
        examPaperPendingCount > 0
          ? `${examPaperPendingCount} exam paper${examPaperPendingCount === 1 ? '' : 's'} still to generate and submit`
          : null,
        missingLessonDays > 0
          ? `Add ${missingLessonDays} missing lesson${missingLessonDays === 1 ? '' : 's'} from the last 2 weeks`
          : 'Lessons look up to date',
        !isClassTeacher
          ? 'Attendance is only for class teachers'
          : missingAttendance > 0
            ? `Mark attendance for ${missingAttendance} class day${missingAttendance === 1 ? '' : 's'}`
            : 'Attendance is marked',
        quizTarget && quizCount < quizTarget
          ? `Quizzes ${quizCount}/${quizTarget} of your minimum`
          : 'Quiz count is on track',
      ].filter(Boolean) as string[],
    };
  }

  async teacherCoach(user: AuthUser) {
    return this.cache.getOrSet(`teacher:coach:${user.id}`, 60_000, async () => {
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
    });
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
