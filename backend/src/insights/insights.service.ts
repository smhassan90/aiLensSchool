import { Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';

@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
  ) {}

  async search(user: AuthUser, q: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const term = q.trim();
    if (term.length < 2) {
      return { students: [], parents: [], teachers: [], classes: [] };
    }

    const [students, parents, teachers, grades] = await Promise.all([
      this.prisma.student.findMany({
        where: {
          schoolId,
          OR: [
            { firstName: { contains: term } },
            { lastName: { contains: term } },
            { studentCode: { contains: term } },
            { admissionNumber: { contains: term } },
            {
              parents: {
                some: {
                  parent: {
                    OR: [
                      { phone: { contains: term } },
                      { user: { firstName: { contains: term } } },
                      { user: { lastName: { contains: term } } },
                      { user: { email: { contains: term } } },
                      { user: { username: { contains: term } } },
                      { user: { phone: { contains: term } } },
                    ],
                  },
                },
              },
            },
          ],
        },
        take: 12,
        include: {
          enrollments: {
            where: { status: 'ACTIVE' },
            include: { grade: true, section: true },
            take: 1,
          },
        },
      }),
      this.prisma.parentProfile.findMany({
        where: {
          schoolId,
          OR: [
            { phone: { contains: term } },
            { user: { firstName: { contains: term } } },
            { user: { lastName: { contains: term } } },
            { user: { email: { contains: term } } },
            { user: { username: { contains: term } } },
            { user: { phone: { contains: term } } },
            {
              students: {
                some: {
                  student: {
                    OR: [
                      { firstName: { contains: term } },
                      { lastName: { contains: term } },
                      { studentCode: { contains: term } },
                    ],
                  },
                },
              },
            },
          ],
        },
        take: 12,
        include: {
          user: { select: { firstName: true, lastName: true, email: true, username: true, phone: true } },
          students: { include: { student: { select: { id: true, firstName: true, lastName: true } } } },
        },
      }),
      this.prisma.teacherProfile.findMany({
        where: {
          schoolId,
          OR: [
            { employeeCode: { contains: term } },
            { user: { firstName: { contains: term } } },
            { user: { lastName: { contains: term } } },
            { user: { email: { contains: term } } },
          ],
        },
        take: 8,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      }),
      this.prisma.grade.findMany({
        where: {
          schoolId,
          OR: [
            { name: { contains: term } },
            { sections: { some: { name: { contains: term } } } },
          ],
        },
        take: 8,
        include: { sections: { select: { id: true, name: true } } },
      }),
    ]);

    return {
      students: students.map((s) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        studentCode: s.studentCode,
        className: s.enrollments[0]?.grade.name,
        sectionName: s.enrollments[0]?.section.name,
      })),
      parents: parents.map((p) => ({
        id: p.id,
        name: `${p.user.firstName} ${p.user.lastName}`,
        email: p.user.email,
        username: p.user.username,
        phone: p.phone ?? p.user.phone,
        children: p.students.map((sp) => `${sp.student.firstName} ${sp.student.lastName}`),
      })),
      teachers: teachers.map((t) => ({
        id: t.id,
        name: `${t.user.firstName} ${t.user.lastName}`,
        email: t.user.email,
        employeeCode: t.employeeCode,
      })),
      classes: grades.map((g) => ({
        id: g.id,
        name: g.name,
        sections: g.sections,
      })),
    };
  }

  async studentOverview(studentId: string, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId },
      include: {
        branch: true,
        enrollments: {
          where: { status: 'ACTIVE' },
          include: { grade: true, section: true, academicYear: true },
          take: 1,
        },
        parents: {
          include: { parent: { include: { user: true } } },
        },
      },
    });
    if (!student) {
      throw new NotFoundException({ code: 'STUDENT_NOT_FOUND', message: 'Student not found' });
    }

    const enrollment = student.enrollments[0];
    const [attendance, results, homework, diaries, reportCards, fees, idCards] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { studentId, schoolId },
        orderBy: { date: 'desc' },
        take: 40,
      }),
      this.prisma.quizResult.findMany({
        where: { studentId, quiz: { schoolId } },
        orderBy: { submittedAt: 'desc' },
        include: { quiz: { include: { subject: true } } },
        take: 20,
      }),
      enrollment
        ? this.prisma.homework.findMany({
            where: { schoolId, sectionId: enrollment.sectionId },
            orderBy: { dueDate: 'desc' },
            include: { subject: true },
            take: 10,
          })
        : [],
      enrollment
        ? this.prisma.homeDiary.findMany({
            where: { schoolId, sectionId: enrollment.sectionId },
            orderBy: { date: 'desc' },
            take: 8,
          })
        : [],
      this.prisma.reportCard.findMany({
        where: { studentId, schoolId },
        orderBy: { generatedAt: 'desc' },
        include: { lines: { include: { subject: true } }, academicYear: true },
      }),
      this.prisma.studentFee.findMany({
        where: { studentId, schoolId },
        include: { feeStructure: true, payments: true },
        orderBy: { dueDate: 'desc' },
      }),
      this.prisma.idCard.findMany({
        where: { studentId, schoolId },
        orderBy: { createdAt: 'desc' },
        take: 1,
      }),
    ]);

    const present = attendance.filter(
      (a) => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.LATE,
    ).length;
    const quizAvg = results.length
      ? results.reduce((sum, r) => sum + Number(r.percentage), 0) / results.length
      : 0;
    const billed = fees.reduce((sum, f) => sum + Number(f.amount), 0);
    const paid = fees.reduce((sum, f) => sum + Number(f.paidAmount), 0);

    return {
      student: {
        ...student,
        grade: enrollment?.grade ?? null,
        section: enrollment?.section ?? null,
        academicYear: enrollment?.academicYear ?? null,
      },
      attendance: {
        total: attendance.length,
        present,
        absent: attendance.filter((a) => a.status === AttendanceStatus.ABSENT).length,
        late: attendance.filter((a) => a.status === AttendanceStatus.LATE).length,
        excused: attendance.filter((a) => a.status === AttendanceStatus.EXCUSED).length,
        rate: attendance.length ? Number(((present / attendance.length) * 100).toFixed(1)) : 0,
        recent: attendance.slice(0, 14),
      },
      quizzes: {
        average: Number(quizAvg.toFixed(1)),
        results: results.map((r) => ({
          id: r.id,
          title: r.quiz.title,
          subject: r.quiz.subject.name,
          score: Number(r.score),
          totalMarks: Number(r.totalMarks),
          percentage: Number(r.percentage),
          submittedAt: r.submittedAt,
        })),
      },
      homework,
      diaries,
      reportCards,
      fees: {
        billed,
        paid,
        due: Number((billed - paid).toFixed(2)),
        items: fees,
      },
      idCard: idCards[0] ?? null,
    };
  }

  async parentOverview(parentId: string, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const parent = await this.prisma.parentProfile.findFirst({
      where: { id: parentId, schoolId },
      include: {
        user: true,
        students: { include: { student: { select: { id: true } } } },
      },
    });
    if (!parent) {
      throw new NotFoundException({ code: 'PARENT_NOT_FOUND', message: 'Parent not found' });
    }
    const children = await Promise.all(
      parent.students.map((link) => this.studentOverview(link.student.id, user)),
    );
    return {
      parent: {
        id: parent.id,
        firstName: parent.user.firstName,
        lastName: parent.user.lastName,
        email: parent.user.email,
        phone: parent.phone ?? parent.user.phone,
      },
      children,
    };
  }

  async classOverview(gradeId: string, user: AuthUser, sectionId?: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const grade = await this.prisma.grade.findFirst({
      where: { id: gradeId, schoolId },
      include: { sections: { include: { branch: true } } },
    });
    if (!grade) {
      throw new NotFoundException({ code: 'CLASS_NOT_FOUND', message: 'Class not found' });
    }

    const sections = sectionId ? grade.sections.filter((s) => s.id === sectionId) : grade.sections;
    const sectionIds = sections.map((s) => s.id);

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { gradeId, status: 'ACTIVE', ...(sectionId ? { sectionId } : {}) },
      include: { student: true, section: true },
    });
    const studentIds = enrollments.map((e) => e.studentId);

    const [attendance, results, fees, quizzes] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { schoolId, ...(sectionIds.length ? { sectionId: { in: sectionIds } } : {}) },
        orderBy: { date: 'asc' },
      }),
      this.prisma.quizResult.findMany({
        where: {
          studentId: { in: studentIds.length ? studentIds : ['none'] },
          quiz: { schoolId },
        },
        include: { quiz: { include: { subject: true } } },
      }),
      this.prisma.studentFee.findMany({
        where: { schoolId, studentId: { in: studentIds.length ? studentIds : ['none'] } },
      }),
      this.prisma.quiz.findMany({
        where: { schoolId, sectionId: { in: sectionIds.length ? sectionIds : ['none'] } },
        include: { subject: true, results: true },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
    ]);

    const attendanceByDate = new Map<string, { present: number; absent: number; late: number }>();
    for (const row of attendance) {
      const key = row.date.toISOString().slice(0, 10);
      const bucket = attendanceByDate.get(key) ?? { present: 0, absent: 0, late: 0 };
      if (row.status === AttendanceStatus.PRESENT) bucket.present += 1;
      if (row.status === AttendanceStatus.ABSENT) bucket.absent += 1;
      if (row.status === AttendanceStatus.LATE) bucket.late += 1;
      attendanceByDate.set(key, bucket);
    }

    const subjectAverages = new Map<string, { total: number; count: number }>();
    for (const result of results) {
      const name = result.quiz.subject.name;
      const current = subjectAverages.get(name) ?? { total: 0, count: 0 };
      current.total += Number(result.percentage);
      current.count += 1;
      subjectAverages.set(name, current);
    }

    const presentCount = attendance.filter(
      (a) => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.LATE,
    ).length;

    const billed = fees.reduce((sum, f) => sum + Number(f.amount), 0);
    const collected = fees.reduce((sum, f) => sum + Number(f.paidAmount), 0);

    const sectionStats = sections.map((section) => {
      const sectionStudents = enrollments.filter((e) => e.sectionId === section.id);
      const ids = new Set(sectionStudents.map((e) => e.studentId));
      const att = attendance.filter((a) => a.sectionId === section.id);
      const attPresent = att.filter(
        (a) => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.LATE,
      ).length;
      const quizRows = results.filter((r) => ids.has(r.studentId));
      const quizAvg = quizRows.length
        ? quizRows.reduce((sum, r) => sum + Number(r.percentage), 0) / quizRows.length
        : 0;
      return {
        id: section.id,
        name: section.name,
        studentCount: sectionStudents.length,
        attendanceRate: att.length ? Number(((attPresent / att.length) * 100).toFixed(1)) : 0,
        quizAverage: Number(quizAvg.toFixed(1)),
      };
    });

    return {
      class: { id: grade.id, name: grade.name, level: grade.level },
      enrollment: {
        total: enrollments.length,
        bySection: sectionStats,
      },
      attendance: {
        rate: attendance.length ? Number(((presentCount / attendance.length) * 100).toFixed(1)) : 0,
        trend: [...attendanceByDate.entries()].map(([date, value]) => ({ date, ...value })),
      },
      quizzes: {
        average: results.length
          ? Number((results.reduce((sum, r) => sum + Number(r.percentage), 0) / results.length).toFixed(1))
          : 0,
        items: quizzes.map((quiz) => {
          const scores = quiz.results.map((r) => Number(r.percentage));
          return {
            id: quiz.id,
            title: quiz.title,
            subject: quiz.subject.name,
            status: quiz.status,
            attempted: scores.length,
            average: scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)) : 0,
            highest: scores.length ? Math.max(...scores) : 0,
            lowest: scores.length ? Math.min(...scores) : 0,
          };
        }),
      },
      subjects: [...subjectAverages.entries()].map(([name, value]) => ({
        name,
        average: Number((value.total / value.count).toFixed(1)),
      })),
      fees: {
        billed,
        collected,
        outstanding: Number((billed - collected).toFixed(2)),
        collectionRate: billed ? Number(((collected / billed) * 100).toFixed(1)) : 0,
      },
    };
  }
}
