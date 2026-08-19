import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleName, TeacherStatus, UserStatus, AttendanceStatus, LessonStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { AI_PROVIDER, AiProvider } from '../ai/providers/ai.provider';
import {
  PERFORMANCE_CRITERIA,
  clampScore,
  weekdaysSince,
  weightedTotal,
  type ScoreKey,
} from './teacher-score';

@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  async create(dto: CreateTeacherDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const email = dto.email.toLowerCase();

    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, schoolId },
    });
    if (!branch) {
      throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'Branch not found' });
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException({
        code: 'EMAIL_EXISTS',
        message: 'Email already registered',
      });
    }

    const existingCode = await this.prisma.teacherProfile.findUnique({
      where: { schoolId_employeeCode: { schoolId, employeeCode: dto.employeeCode } },
    });
    if (existingCode) {
      throw new ConflictException({
        code: 'EMPLOYEE_CODE_EXISTS',
        message: 'Employee code already exists',
      });
    }

    const teacherRole = await this.prisma.role.findUnique({ where: { name: RoleName.TEACHER } });
    if (!teacherRole) {
      throw new ConflictException({ code: 'ROLE_MISSING', message: 'TEACHER role missing' });
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const teacherUser = await tx.user.create({
        data: {
          email,
          username: email.split('@')[0],
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          schoolId,
          status: UserStatus.ACTIVE,
        },
      });

      await tx.userRole.create({
        data: { userId: teacherUser.id, roleId: teacherRole.id, schoolId },
      });

      const profile = await tx.teacherProfile.create({
        data: {
          userId: teacherUser.id,
          schoolId,
          branchId: dto.branchId,
          employeeCode: dto.employeeCode,
          hireDate: dto.hireDate ? new Date(dto.hireDate) : null,
          status: TeacherStatus.ACTIVE,
        },
      });

      if (dto.subjects?.length) {
        for (const s of dto.subjects) {
          await tx.teacherSubject.create({
            data: {
              teacherId: profile.id,
              subjectId: s.subjectId,
              branchId: dto.branchId,
              academicYearId: s.academicYearId,
            },
          });
        }
      }

      if (dto.classSubjects?.length) {
        for (const cs of dto.classSubjects) {
          await tx.classSubject.upsert({
            where: {
              sectionId_subjectId_academicYearId: {
                sectionId: cs.sectionId,
                subjectId: cs.subjectId,
                academicYearId: cs.academicYearId,
              },
            },
            create: {
              sectionId: cs.sectionId,
              subjectId: cs.subjectId,
              academicYearId: cs.academicYearId,
              branchId: dto.branchId,
              teacherId: profile.id,
            },
            update: { teacherId: profile.id },
          });
        }
      }

      return { user: teacherUser, profile };
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      branchId: dto.branchId,
      action: 'TEACHER_CREATED',
      entityType: 'TeacherProfile',
      entityId: result.profile.id,
    });

    return {
      id: result.profile.id,
      userId: result.user.id,
      email: result.user.email,
      employeeCode: result.profile.employeeCode,
      branchId: result.profile.branchId,
    };
  }

  async findAll(
    user: AuthUser,
    query: PaginationDto & { search?: string; branchId?: string; status?: TeacherStatus },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.TeacherProfileWhereInput = {
      schoolId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { employeeCode: { contains: query.search } },
              { user: { firstName: { contains: query.search } } },
              { user: { lastName: { contains: query.search } } },
              { user: { email: { contains: query.search } } },
            ],
          }
        : {}),
    };

    const [items, total] = await pageQuery(
      (skip, take) =>
        this.prisma.teacherProfile.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          select: {
            id: true,
            employeeCode: true,
            status: true,
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                status: true,
              },
            },
            branch: { select: { id: true, name: true } },
          },
        }),
      () => this.prisma.teacherProfile.count({ where }),
      page,
      limit,
    );

    return paginate(items, total, page, limit);
  }

  async findOne(id: string, user: AuthUser) {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            status: true,
          },
        },
        branch: true,
        teacherSubjects: { include: { subject: true, academicYear: true } },
        classSubjects: {
          include: { section: true, subject: true, academicYear: true },
        },
        assistantClassSubjects: {
          include: { section: true, subject: true, academicYear: true },
        },
      },
    });
    return this.tenant.assertOwnedOrThrow(user, teacher, 'TEACHER_NOT_FOUND');
  }

  async myClasses(user: AuthUser) {
    const classSelect = {
      sectionId: true,
      subjectId: true,
      academicYearId: true,
      branchId: true,
      section: { select: { id: true, name: true, grade: { select: { id: true, name: true } } } },
      subject: { select: { id: true, name: true } },
    } as const;
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId: user.id },
      select: {
        classSubjects: { select: classSelect },
        assistantClassSubjects: { select: classSelect },
      },
    });
    if (!profile) {
      throw new NotFoundException({
        code: 'TEACHER_PROFILE_NOT_FOUND',
        message: 'Teacher profile not found',
      });
    }
    return [
      ...profile.classSubjects.map((item) => ({ ...item, role: 'TEACHER' as const })),
      ...profile.assistantClassSubjects.map((item) => ({ ...item, role: 'ASSISTANT' as const })),
    ];
  }

  async getProfileByUserId(userId: string) {
    return this.prisma.teacherProfile.findUnique({ where: { userId } });
  }

  async performance(id: string, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const scored = await this.scoreOne(id, schoolId);
    if (!scored) throw new NotFoundException({ code: 'TEACHER_NOT_FOUND', message: 'Teacher not found' });
    return scored;
  }

  async scoreboard(user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const teachers = await this.prisma.teacherProfile.findMany({
      where: { schoolId, status: TeacherStatus.ACTIVE },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    const rows = (
      await Promise.all(teachers.map((teacher) => this.scoreOne(teacher.id, schoolId)))
    ).filter((row): row is NonNullable<typeof row> => Boolean(row));
    rows.sort((a, b) => b.total - a.total);
    return {
      weights: PERFORMANCE_CRITERIA,
      teachers: rows.map((row, index) => ({ ...row, rank: index + 1 })),
    };
  }

  async listTeacherAttendance(user: AuthUser, date: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const day = new Date(date);
    const teachers = await this.prisma.teacherProfile.findMany({
      where: { schoolId, status: TeacherStatus.ACTIVE },
      orderBy: { user: { firstName: 'asc' } },
      select: {
        id: true,
        employeeCode: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    const marks = await this.prisma.teacherAttendance.findMany({
      where: { schoolId, date: day },
      select: { teacherId: true, status: true },
    });
    const byTeacher = new Map(marks.map((row) => [row.teacherId, row.status]));
    return teachers.map((teacher) => ({
      teacherId: teacher.id,
      name: `${teacher.user.firstName} ${teacher.user.lastName}`,
      employeeCode: teacher.employeeCode,
      status: byTeacher.get(teacher.id) ?? AttendanceStatus.PRESENT,
    }));
  }

  async markTeacherAttendance(
    user: AuthUser,
    dto: { date: string; entries: Array<{ teacherId: string; status: 'PRESENT' | 'ABSENT' }> },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const day = new Date(dto.date);
    await this.prisma.$transaction(
      dto.entries.map((entry) =>
        this.prisma.teacherAttendance.upsert({
          where: { teacherId_date: { teacherId: entry.teacherId, date: day } },
          create: {
            schoolId,
            teacherId: entry.teacherId,
            date: day,
            status: entry.status,
            recordedById: user.id,
          },
          update: { status: entry.status, recordedById: user.id },
        }),
      ),
    );
    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'TEACHER_ATTENDANCE_MARKED',
      entityType: 'TeacherAttendance',
      metadata: { date: dto.date, count: dto.entries.length },
    });
    return { saved: dto.entries.length };
  }

  async coach(id: string, user: AuthUser) {
    const board = await this.scoreboard(user);
    const facts = board.teachers.find((row) => row.teacher.id === id);
    if (!facts) throw new NotFoundException({ code: 'TEACHER_NOT_FOUND', message: 'Teacher not found' });
    const text = [
      `Teacher: ${facts.teacher.name}`,
      `Rank: ${facts.rank ?? 'n/a'} · Weighted score: ${facts.total}/100`,
      `Weights: ${PERFORMANCE_CRITERIA.map((c) => `${c.label} ${c.points}`).join(', ')}`,
      `Lessons last 14 school days: ${facts.metrics.lessons.done}/${facts.metrics.lessons.expected} (score ${facts.scores.lessons ?? 'n/a'})`,
      `Quizzes created: ${facts.metrics.quizzes.created} vs target ${facts.metrics.quizzes.target} (score ${facts.scores.quizzesCreated ?? 'n/a'})`,
      `Quiz completion in this teacher's subjects: ${facts.metrics.quizzes.completion ?? 'n/a'}%`,
      `Quiz marks ≥70% rate: ${facts.metrics.quizzes.goodMarks ?? 'n/a'}% · average ${facts.metrics.quizzes.average ?? 'n/a'}%`,
      `Annual/term results in this teacher's subjects: ${facts.metrics.annual.average ?? 'n/a'}% (${facts.metrics.annual.source})`,
      `Teacher attendance (admin-marked): ${facts.metrics.teacherAttendance.present}/${facts.metrics.teacherAttendance.marked} days`,
      `Student attendance in this teacher's classes: ${facts.metrics.studentAttendance.rate ?? 'n/a'}% (discuss, do not blame)`,
      `Class teacher of: ${facts.classTeacherOf?.join(', ') || 'none'}`,
      ...facts.byClass.map(
        (row) =>
          `${row.className} ${row.subject}: lessons ${row.lessons}, quizzes ${row.quizzes}, ${row.attempts}/${row.enrolled} attempted, quiz avg ${row.quizAverage ?? 'n/a'}%, term avg ${row.termAverage ?? 'n/a'}%, student attendance ${row.studentAttendance ?? 'n/a'}%`,
      ),
    ].join('\n');
    const result = await this.ai.coach({ facts: text });
    const cards = result.data.cards ?? [];
    const coaching = {
      ...result.data,
      cards,
      strengths: result.data.strengths?.length
        ? result.data.strengths
        : cards.filter((card) => card.tone === 'good').map((card) => card.body),
      improvements: result.data.improvements?.length
        ? result.data.improvements
        : cards.filter((card) => card.tone !== 'good').map((card) => card.body),
      discussTonight: result.data.discussTonight?.length
        ? result.data.discussTonight
        : result.data.improvements?.length
          ? result.data.improvements
          : cards.filter((card) => card.tone !== 'good').map((card) => card.body),
    };
    return { performance: facts, coaching };
  }

  private async scoreOne(teacherId: string, schoolId: string) {
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { id: teacherId, schoolId },
      include: {
        user: { select: { firstName: true, lastName: true } },
        classSubjects: {
          include: {
            section: { include: { grade: true } },
            subject: true,
          },
        },
        classSections: { include: { grade: true } },
      },
    });
    if (!teacher) return null;

    const since = new Date();
    since.setDate(since.getDate() - 14);
    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const schoolDays = weekdaysSince(since);
    const classes = teacher.classSubjects;
    const sectionIds = [...new Set(classes.map((item) => item.sectionId))];
    const subjectIds = [...new Set(classes.map((item) => item.subjectId))];

    const [lessons, quizzes, enrollments, studentAttendance, teacherMarks, assessments, targets] = await Promise.all([
      this.prisma.dailyLesson.findMany({
        where: {
          teacherId: teacher.id,
          date: { gte: since },
          status: { not: LessonStatus.CANCELLED },
        },
        select: { sectionId: true, subjectId: true, date: true },
      }),
      classes.length
        ? this.prisma.quiz.findMany({
        where: {
          createdById: teacher.userId,
          OR: classes.map((cls) => ({ sectionId: cls.sectionId, subjectId: cls.subjectId })),
        },
        select: {
          id: true,
          sectionId: true,
          subjectId: true,
          _count: { select: { attempts: true, assignments: true, results: true } },
          results: { select: { percentage: true } },
        },
      })
        : Promise.resolve([]),
      sectionIds.length
        ? this.prisma.studentEnrollment.groupBy({
            by: ['sectionId'],
            where: { sectionId: { in: sectionIds }, status: 'ACTIVE' },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      sectionIds.length
        ? this.prisma.attendance.findMany({
            where: { schoolId, sectionId: { in: sectionIds }, date: { gte: since } },
            select: { sectionId: true, status: true },
          })
        : Promise.resolve([]),
      this.prisma.teacherAttendance.findMany({
        where: { teacherId: teacher.id, date: { gte: since } },
        select: { status: true, date: true },
      }),
      subjectIds.length && sectionIds.length
        ? this.prisma.assessmentMark.findMany({
            where: {
              schoolId,
              subjectId: { in: subjectIds },
              sectionId: { in: sectionIds },
              assessedAt: { gte: yearAgo },
              type: { in: ['TERM_EXAM', 'PHYSICAL_TEST', 'CLASS_TEST'] },
            },
            select: { sectionId: true, subjectId: true, marks: true, maxMarks: true, type: true },
          })
        : Promise.resolve([]),
      this.prisma.quizTarget.findMany({ where: { schoolId } }),
    ]);

    const pairKey = (sectionId: string, subjectId: string) => `${sectionId}:${subjectId}`;
    const taughtPairs = new Set(classes.map((cls) => pairKey(cls.sectionId, cls.subjectId)));
    const scopedAssessments = assessments.filter((row) => taughtPairs.has(pairKey(row.sectionId, row.subjectId)));

    const enrolledBySection = new Map(enrollments.map((row) => [row.sectionId, row._count._all]));
    const expectedLessons = schoolDays.length * classes.length;
    const lessonScore =
      classes.length && expectedLessons
        ? clampScore((lessons.length / expectedLessons) * 100)
        : null;

    const target = targets.reduce((sum, row) => {
      const match = classes.some(
        (cls) => cls.section.grade.id === row.gradeId && cls.subjectId === row.subjectId,
      );
      return match ? sum + row.minQuizzes : sum;
    }, 0) || (classes.length ? Math.max(4, classes.length) : 0);
    const quizCreateScore =
      classes.length && target ? clampScore((quizzes.length / Math.max(target, 1)) * 100) : null;

    const enrolledTotal = classes.reduce((sum, cls) => sum + (enrolledBySection.get(cls.sectionId) ?? 0), 0);
    const attempts = quizzes.reduce((sum, quiz) => sum + quiz._count.attempts, 0);
    const assigned = quizzes.reduce((sum, quiz) => sum + quiz._count.assignments, 0);
    const completionBase = assigned || enrolledTotal;
    const completion =
      quizzes.length && completionBase ? Math.round((attempts / completionBase) * 100) : null;
    const allResults = quizzes.flatMap((quiz) => quiz.results);
    const quizAvg = allResults.length
      ? allResults.reduce((sum, row) => sum + Number(row.percentage), 0) / allResults.length
      : null;
    const goodMarks = allResults.length
      ? Math.round((allResults.filter((row) => Number(row.percentage) >= 70).length / allResults.length) * 100)
      : null;

    const termRows = scopedAssessments.filter((row) => row.type === 'TERM_EXAM');
    const resultRows = termRows.length ? termRows : scopedAssessments;
    const annualAvg = resultRows.length
      ? resultRows.reduce((sum, row) => sum + (Number(row.maxMarks) ? (Number(row.marks) / Number(row.maxMarks)) * 100 : 0), 0) /
        resultRows.length
      : quizAvg;
    const annualSource = termRows.length
      ? 'term exams'
      : scopedAssessments.length
        ? 'class tests'
        : quizAvg != null
          ? 'quiz scores (no term exams yet)'
          : 'none';

    const presentStudents = studentAttendance.filter((row) => row.status === AttendanceStatus.PRESENT).length;
    const studentAttRate = studentAttendance.length
      ? Math.round((presentStudents / studentAttendance.length) * 100)
      : null;

    const teacherPresent = teacherMarks.filter((row) => row.status === AttendanceStatus.PRESENT).length;
    const teacherAttScore = teacherMarks.length ? clampScore((teacherPresent / teacherMarks.length) * 100) : null;

    const scores: Record<ScoreKey, number | null> = {
      annualResults: annualAvg != null ? clampScore(annualAvg) : null,
      lessons: lessonScore,
      quizzesCreated: quizCreateScore,
      teacherAttendance: teacherAttScore,
      quizCompletion: completion,
      quizMarks: goodMarks ?? (quizAvg != null ? clampScore(quizAvg) : null),
      studentAttendance: studentAttRate,
    };
    const total = weightedTotal(scores);

    const byClass = classes.map((cls) => {
      const classLessons = lessons.filter((row) => row.sectionId === cls.sectionId && row.subjectId === cls.subjectId);
      const classQuizzes = quizzes.filter((row) => row.sectionId === cls.sectionId && row.subjectId === cls.subjectId);
      const classResults = classQuizzes.flatMap((quiz) => quiz.results);
      const classAvg = classResults.length
        ? Number((classResults.reduce((sum, row) => sum + Number(row.percentage), 0) / classResults.length).toFixed(1))
        : null;
      const classAttempts = classQuizzes.reduce((sum, quiz) => sum + quiz._count.attempts, 0);
      const enrolled = enrolledBySection.get(cls.sectionId) ?? 0;
      const classAssess = resultRows.filter((row) => row.sectionId === cls.sectionId && row.subjectId === cls.subjectId);
      const termAverage = classAssess.length
        ? Number(
            (
              classAssess.reduce(
                (sum, row) => sum + (Number(row.maxMarks) ? (Number(row.marks) / Number(row.maxMarks)) * 100 : 0),
                0,
              ) / classAssess.length
            ).toFixed(1),
          )
        : null;
      const sectionAtt = studentAttendance.filter((row) => row.sectionId === cls.sectionId);
      const sectionPresent = sectionAtt.filter((row) => row.status === AttendanceStatus.PRESENT).length;
      return {
        className: `${cls.section.grade.name} ${cls.section.name}`,
        subject: cls.subject.name,
        sectionId: cls.sectionId,
        subjectId: cls.subjectId,
        lessons: classLessons.length,
        quizzes: classQuizzes.length,
        attempts: classAttempts,
        enrolled,
        quizAverage: classAvg,
        termAverage,
        studentAttendance: sectionAtt.length ? Math.round((sectionPresent / sectionAtt.length) * 100) : null,
      };
    });

    return {
      teacher: {
        id: teacher.id,
        name: `${teacher.user.firstName} ${teacher.user.lastName}`,
      },
      total,
      rank: undefined as number | undefined,
      scores,
      metrics: {
        lessons: { done: lessons.length, expected: expectedLessons },
        quizzes: {
          created: quizzes.length,
          target,
          completion,
          goodMarks,
          average: quizAvg != null ? Number(quizAvg.toFixed(1)) : null,
        },
        annual: { average: annualAvg != null ? Number(annualAvg.toFixed(1)) : null, source: annualSource },
        teacherAttendance: { present: teacherPresent, marked: teacherMarks.length },
        studentAttendance: { rate: studentAttRate, records: studentAttendance.length },
      },
      byClass,
      last30Days: {
        lessonsAdded: lessons.length,
        attendanceDaysMarked: teacherMarks.length,
      },
      classTeacherOf: teacher.classSections.map((section) => `${section.grade.name} ${section.name}`),
    };
  }
}
