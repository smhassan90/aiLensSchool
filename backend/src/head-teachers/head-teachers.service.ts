import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceStatus,
  EnrollmentStatus,
  ExamPaperReviewStatus,
  RoleName,
  TeacherStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { TeachersService } from '../teachers/teachers.service';
import { PERFORMANCE_CRITERIA } from '../teachers/teacher-score';
import { AcademicsService } from '../academics/academics.service';
import { SaveHeadTeacherBoardDto } from './dto/head-teachers.dto';
import { teacherDisplayName } from '../common/utils/person-name';
import { sectionClassLabel } from '../common/utils/section-class-label';
import { studentSearchWhere } from '../common/utils/student-search';

@Injectable()
export class HeadTeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
    private readonly teachersService: TeachersService,
    private readonly academicsService: AcademicsService,
  ) {}

  async getBoard(user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const [teachers, sections, assignments] = await Promise.all([
      this.prisma.teacherProfile.findMany({
        where: { schoolId, status: TeacherStatus.ACTIVE },
        orderBy: [{ user: { firstName: 'asc' } }, { user: { lastName: 'asc' } }],
        select: {
          id: true,
          employeeCode: true,
          gender: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.section.findMany({
        where: { schoolId },
        orderBy: [{ grade: { level: 'asc' } }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          grade: { select: { id: true, name: true, level: true } },
          headTeacherSection: {
            select: {
              headTeacher: {
                select: { id: true, teacherId: true, title: true },
              },
            },
          },
        },
      }),
      this.prisma.headTeacherAssignment.findMany({
        where: { schoolId },
        include: {
          teacher: {
            select: {
              id: true,
              gender: true,
              user: { select: { firstName: true, lastName: true, email: true } },
            },
          },
          sections: {
            include: {
              section: {
                select: {
                  id: true,
                  name: true,
                  grade: { select: { id: true, name: true, level: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const assignedSectionIds = new Set(
      assignments.flatMap((row) => row.sections.map((link) => link.sectionId)),
    );

    return {
      teachers: teachers.map((row) => ({
        id: row.id,
        name: teacherDisplayName(row.user.firstName, row.user.lastName, row.gender),
        email: row.user.email,
        employeeCode: row.employeeCode,
      })),
      unassignedSections: sections
        .filter((row) => !assignedSectionIds.has(row.id))
        .map((row) => ({
          id: row.id,
          name: row.name,
          gradeId: row.grade.id,
          gradeName: row.grade.name,
          classLabel: sectionClassLabel({ name: row.name, grade: row.grade }),
        })),
      assignments: assignments.map((row) => ({
        id: row.id,
        teacherId: row.teacherId,
        title: row.title,
        teacherName: teacherDisplayName(
          row.teacher.user.firstName,
          row.teacher.user.lastName,
          row.teacher.gender,
        ),
        sections: row.sections.map((link) => ({
          id: link.section.id,
          name: link.section.name,
          gradeId: link.section.grade.id,
          gradeName: link.section.grade.name,
          classLabel: sectionClassLabel(link.section),
        })),
      })),
    };
  }

  async saveBoard(user: AuthUser, dto: SaveHeadTeacherBoardDto) {
    const schoolId = this.tenant.requireSchoolId(user);
    const assignments = dto.assignments ?? [];

    const teacherIds = new Set<string>();
    const sectionIds = new Set<string>();
    for (const row of assignments) {
      const title = row.title?.trim();
      if (!row.teacherId?.trim()) {
        throw new BadRequestException({
          code: 'TEACHER_REQUIRED',
          message: 'Each head teacher needs a teacher selected',
        });
      }
      if (!title) {
        throw new BadRequestException({
          code: 'TITLE_REQUIRED',
          message: 'Each head teacher needs a title',
        });
      }
      if (teacherIds.has(row.teacherId)) {
        throw new BadRequestException({
          code: 'DUPLICATE_HEAD_TEACHER',
          message: 'Each teacher can only appear once as a head teacher',
        });
      }
      teacherIds.add(row.teacherId);
      for (const sectionId of row.sectionIds ?? []) {
        if (sectionIds.has(sectionId)) {
          throw new BadRequestException({
            code: 'DUPLICATE_SECTION',
            message: 'Each class can only belong to one head teacher',
          });
        }
        sectionIds.add(sectionId);
      }
    }

    const [teachers, sections] = await Promise.all([
      this.prisma.teacherProfile.findMany({
        where: { schoolId, id: { in: [...teacherIds] } },
        select: { id: true },
      }),
      this.prisma.section.findMany({
        where: { schoolId, id: { in: [...sectionIds] } },
        select: { id: true },
      }),
    ]);
    if (teachers.length !== teacherIds.size) {
      throw new BadRequestException({
        code: 'INVALID_TEACHER',
        message: 'One or more teachers were not found',
      });
    }
    if (sections.length !== sectionIds.size) {
      throw new BadRequestException({
        code: 'INVALID_SECTION',
        message: 'One or more classes were not found',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.headTeacherAssignment.findMany({
        where: { schoolId },
        select: { id: true, teacherId: true },
      });
      const keepTeacherIds = new Set(assignments.map((row) => row.teacherId));
      const removeIds = existing
        .filter((row) => !keepTeacherIds.has(row.teacherId))
        .map((row) => row.id);
      if (removeIds.length) {
        await tx.headTeacherAssignment.deleteMany({ where: { id: { in: removeIds } } });
      }

      for (const row of assignments) {
        const assignment = await tx.headTeacherAssignment.upsert({
          where: { teacherId: row.teacherId },
          create: {
            schoolId,
            teacherId: row.teacherId,
            title: row.title.trim(),
          },
          update: { title: row.title.trim() },
        });
        await tx.headTeacherSection.deleteMany({
          where: { headTeacherAssignmentId: assignment.id },
        });
        if (row.sectionIds?.length) {
          await tx.headTeacherSection.createMany({
            data: row.sectionIds.map((sectionId) => ({
              headTeacherAssignmentId: assignment.id,
              sectionId,
            })),
          });
        }
      }
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'HEAD_TEACHER_BOARD_UPDATED',
      entityType: 'HeadTeacherAssignment',
      metadata: { assignmentCount: assignments.length },
    });

    return this.getBoard(user);
  }

  async getMyAssignment(user: AuthUser) {
    const profile = await this.requireHeadTeacherProfile(user);
    if (!profile) return null;
    return {
      id: profile.assignment.id,
      title: profile.assignment.title,
      sections: profile.sections.map((row) => ({
        id: row.id,
        name: row.name,
        gradeId: row.grade.id,
        gradeName: row.grade.name,
        classLabel: sectionClassLabel(row),
      })),
    };
  }

  async resolveSectionIds(user: AuthUser): Promise<string[] | null> {
    const profile = await this.requireHeadTeacherProfile(user);
    if (!profile) return null;
    return profile.sectionIds;
  }

  async assertHeadTeacher(user: AuthUser) {
    const sectionIds = await this.resolveSectionIds(user);
    if (!sectionIds?.length) {
      throw new ForbiddenException({
        code: 'HEAD_TEACHER_REQUIRED',
        message: 'Head teacher access is required',
      });
    }
    return sectionIds;
  }

  async canReviewExamPaper(user: AuthUser, quizId: string): Promise<boolean> {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: { sectionId: true, schoolId: true },
    });
    if (!quiz?.sectionId) return false;
    this.tenant.assertSchoolAccess(user, quiz.schoolId);
    const sectionIds = await this.resolveSectionIds(user);
    return Boolean(sectionIds?.includes(quiz.sectionId));
  }

  async assertStudentAccess(user: AuthUser, studentId: string) {
    const sectionIds = await this.assertHeadTeacher(user);
    const schoolId = this.tenant.requireSchoolId(user);
    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: {
        studentId,
        status: EnrollmentStatus.ACTIVE,
        sectionId: { in: sectionIds },
        student: { schoolId },
      },
      select: { id: true },
    });
    if (!enrollment) {
      throw new ForbiddenException({
        code: 'STUDENT_OUT_OF_SCOPE',
        message: 'This student is not in your supervised classes',
      });
    }
  }

  async getDashboard(user: AuthUser) {
    const profile = await this.requireHeadTeacherProfile(user);
    if (!profile) {
      throw new ForbiddenException({
        code: 'HEAD_TEACHER_REQUIRED',
        message: 'Head teacher access is required',
      });
    }
    const schoolId = this.tenant.requireSchoolId(user);
    const sectionIds = profile.sectionIds;
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      orderBy: { startDate: 'desc' },
      select: { id: true, name: true },
    });

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [
      studentCount,
      teacherIds,
      attendanceRows,
      pendingPapers,
      recentQuizzes,
      recentHomework,
    ] = await Promise.all([
      this.prisma.studentEnrollment.count({
        where: { sectionId: { in: sectionIds }, status: EnrollmentStatus.ACTIVE },
      }),
      this.prisma.classSubject.findMany({
        where: {
          sectionId: { in: sectionIds },
          ...(year ? { academicYearId: year.id } : {}),
          teacherId: { not: null },
        },
        select: { teacherId: true },
        distinct: ['teacherId'],
      }),
      this.prisma.attendance.findMany({
        where: {
          schoolId,
          sectionId: { in: sectionIds },
          date: { gte: since },
        },
        select: { status: true },
      }),
      this.prisma.quiz.count({
        where: {
          schoolId,
          sectionId: { in: sectionIds },
          reviewStatus: ExamPaperReviewStatus.PENDING_REVIEW,
        },
      }),
      this.prisma.quiz.count({
        where: {
          schoolId,
          sectionId: { in: sectionIds },
          status: { in: ['PUBLISHED', 'CLOSED'] },
          paperKind: 'QUIZ',
          createdAt: { gte: since },
        },
      }),
      this.prisma.homework.count({
        where: {
          schoolId,
          sectionId: { in: sectionIds },
          createdAt: { gte: since },
        },
      }),
    ]);

    const present = attendanceRows.filter(
      (row) => row.status === AttendanceStatus.PRESENT || row.status === AttendanceStatus.LATE,
    ).length;
    const attendanceRate = attendanceRows.length
      ? Math.round((present / attendanceRows.length) * 100)
      : null;

    return {
      title: profile.assignment.title,
      academicYear: year,
      sections: profile.sections.map((row) => ({
        id: row.id,
        classLabel: sectionClassLabel(row),
      })),
      stats: {
        classes: sectionIds.length,
        students: studentCount,
        teachers: teacherIds.length,
        attendanceRate,
        pendingExamPapers: pendingPapers,
        recentQuizzes,
        recentHomework,
      },
    };
  }

  async getAttendanceOverview(user: AuthUser) {
    const sectionIds = await this.assertHeadTeacher(user);
    const schoolId = this.tenant.requireSchoolId(user);
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const sections = await this.prisma.section.findMany({
      where: { id: { in: sectionIds }, schoolId },
      include: { grade: { select: { name: true } } },
      orderBy: [{ grade: { level: 'asc' } }, { name: 'asc' }],
    });

    const rows = await Promise.all(
      sections.map(async (section) => {
        const [enrolled, attendance] = await Promise.all([
          this.prisma.studentEnrollment.count({
            where: { sectionId: section.id, status: EnrollmentStatus.ACTIVE },
          }),
          this.prisma.attendance.findMany({
            where: { sectionId: section.id, schoolId, date: { gte: since } },
            select: { status: true },
          }),
        ]);
        const present = attendance.filter(
          (row) => row.status === AttendanceStatus.PRESENT || row.status === AttendanceStatus.LATE,
        ).length;
        return {
          sectionId: section.id,
          classLabel: sectionClassLabel(section),
          enrolled,
          records: attendance.length,
          attendanceRate: attendance.length ? Math.round((present / attendance.length) * 100) : null,
        };
      }),
    );

    const totalRecords = rows.reduce((sum, row) => sum + row.records, 0);
    const totalPresent = rows.reduce((sum, row) => {
      if (row.records === 0 || row.attendanceRate == null) return sum;
      return sum + Math.round((row.attendanceRate / 100) * row.records);
    }, 0);

    return {
      since: since.toISOString().slice(0, 10),
      summary: {
        classes: rows.length,
        attendanceRate: totalRecords ? Math.round((totalPresent / totalRecords) * 100) : null,
      },
      classes: rows,
    };
  }

  async searchStudents(user: AuthUser, q: string) {
    const sectionIds = await this.assertHeadTeacher(user);
    const schoolId = this.tenant.requireSchoolId(user);
    const term = q.trim();
    if (term.length < 2) return { students: [] };

    const students = await this.prisma.student.findMany({
      where: {
        schoolId,
        enrollments: {
          some: {
            status: EnrollmentStatus.ACTIVE,
            sectionId: { in: sectionIds },
          },
        },
        ...(studentSearchWhere(term) ?? {}),
      },
      take: 20,
      include: {
        enrollments: {
          where: { status: EnrollmentStatus.ACTIVE, sectionId: { in: sectionIds } },
          include: { grade: true, section: true },
          take: 1,
        },
      },
    });

    return {
      students: students.map((row) => ({
        id: row.id,
        name: `${row.firstName} ${row.lastName}`.trim(),
        studentCode: row.studentCode,
        className: row.enrollments[0]?.grade.name,
        sectionName: row.enrollments[0]?.section.name,
      })),
    };
  }

  async getTeacherProgress(user: AuthUser) {
    const sectionIds = await this.assertHeadTeacher(user);
    const schoolId = this.tenant.requireSchoolId(user);
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      orderBy: { startDate: 'desc' },
      select: { id: true },
    });

    const teacherLinks = await this.prisma.classSubject.findMany({
      where: {
        sectionId: { in: sectionIds },
        ...(year ? { academicYearId: year.id } : {}),
        teacherId: { not: null },
      },
      select: { teacherId: true },
      distinct: ['teacherId'],
    });
    const teacherIds = teacherLinks.map((row) => row.teacherId!).filter(Boolean);

    const rows = (
      await Promise.all(teacherIds.map((id) => this.teachersService.performance(id, user)))
    ).filter(Boolean);
    rows.sort((a, b) => b.total - a.total);

    return {
      weights: PERFORMANCE_CRITERIA,
      teachers: rows.map((row, index) => ({ ...row, rank: index + 1 })),
    };
  }

  async listQuizzes(
    user: AuthUser,
    query: { sectionId?: string; teacherId?: string; subjectId?: string },
  ) {
    const sectionIds = await this.assertHeadTeacher(user);
    const schoolId = this.tenant.requireSchoolId(user);
    if (query.sectionId && !sectionIds.includes(query.sectionId)) {
      throw new ForbiddenException({ code: 'SECTION_OUT_OF_SCOPE', message: 'Class not supervised' });
    }

    const quizzes = await this.prisma.quiz.findMany({
      where: {
        schoolId,
        sectionId: { in: query.sectionId ? [query.sectionId] : sectionIds },
        paperKind: 'QUIZ',
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
        ...(query.teacherId ? { createdBy: { teacherProfile: { id: query.teacherId } } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        subject: { select: { id: true, name: true } },
        section: { include: { grade: { select: { name: true } } } },
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
            teacherProfile: { select: { id: true, gender: true } },
          },
        },
      },
    });

    return {
      items: quizzes.map((quiz) => ({
        id: quiz.id,
        title: quiz.title,
        status: quiz.status,
        createdAt: quiz.createdAt,
        subject: quiz.subject,
        classLabel: quiz.section
          ? sectionClassLabel(quiz.section)
          : null,
        teacherName: quiz.createdBy.teacherProfile
          ? teacherDisplayName(
              quiz.createdBy.firstName,
              quiz.createdBy.lastName,
              quiz.createdBy.teacherProfile.gender,
            )
          : `${quiz.createdBy.firstName} ${quiz.createdBy.lastName}`.trim(),
        teacherId: quiz.createdBy.teacherProfile?.id ?? null,
      })),
    };
  }

  async listHomework(
    user: AuthUser,
    query: { sectionId?: string; teacherId?: string; subjectId?: string },
  ) {
    const sectionIds = await this.assertHeadTeacher(user);
    const schoolId = this.tenant.requireSchoolId(user);
    if (query.sectionId && !sectionIds.includes(query.sectionId)) {
      throw new ForbiddenException({ code: 'SECTION_OUT_OF_SCOPE', message: 'Class not supervised' });
    }

    const items = await this.prisma.homework.findMany({
      where: {
        schoolId,
        sectionId: { in: query.sectionId ? [query.sectionId] : sectionIds },
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
        ...(query.teacherId ? { createdBy: { teacherProfile: { id: query.teacherId } } } : {}),
      },
      orderBy: { dueDate: 'desc' },
      take: 100,
      include: {
        subject: { select: { id: true, name: true } },
        section: { include: { grade: { select: { name: true } } } },
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
            teacherProfile: { select: { id: true, gender: true } },
          },
        },
      },
    });

    return {
      items: items.map((row) => ({
        id: row.id,
        title: row.title,
        dueDate: row.dueDate,
        subject: row.subject,
        classLabel: row.section
          ? sectionClassLabel(row.section)
          : null,
        teacherName: row.createdBy.teacherProfile
          ? teacherDisplayName(
              row.createdBy.firstName,
              row.createdBy.lastName,
              row.createdBy.teacherProfile.gender,
            )
          : `${row.createdBy.firstName} ${row.createdBy.lastName}`.trim(),
        teacherId: row.createdBy.teacherProfile?.id ?? null,
      })),
    };
  }

  async listResults(
    user: AuthUser,
    query: { sectionId?: string; teacherId?: string; subjectId?: string },
  ) {
    const sectionIds = await this.assertHeadTeacher(user);
    const schoolId = this.tenant.requireSchoolId(user);
    if (query.sectionId && !sectionIds.includes(query.sectionId)) {
      throw new ForbiddenException({ code: 'SECTION_OUT_OF_SCOPE', message: 'Class not supervised' });
    }

    const [quizResults, assessmentMarks] = await Promise.all([
      this.prisma.quizResult.findMany({
        where: {
          quiz: {
            schoolId,
            sectionId: { in: query.sectionId ? [query.sectionId] : sectionIds },
            ...(query.subjectId ? { subjectId: query.subjectId } : {}),
            ...(query.teacherId
              ? { createdBy: { teacherProfile: { id: query.teacherId } } }
              : {}),
          },
        },
        orderBy: { submittedAt: 'desc' },
        take: 80,
        include: {
          student: { select: { id: true, firstName: true, lastName: true, studentCode: true } },
          quiz: {
            select: {
              id: true,
              title: true,
              subject: { select: { name: true } },
              section: { include: { grade: { select: { name: true } } } },
            },
          },
        },
      }),
      this.prisma.assessmentMark.findMany({
        where: {
          schoolId,
          sectionId: { in: query.sectionId ? [query.sectionId] : sectionIds },
          ...(query.subjectId ? { subjectId: query.subjectId } : {}),
          ...(query.teacherId ? { recordedBy: { teacherProfile: { id: query.teacherId } } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 80,
        include: {
          student: { select: { id: true, firstName: true, lastName: true, studentCode: true } },
          subject: { select: { name: true } },
          section: { include: { grade: { select: { name: true } } } },
          examConfig: { select: { name: true } },
        },
      }),
    ]);

    return {
      quizResults: quizResults.map((row) => ({
        id: row.id,
        studentName: `${row.student.firstName} ${row.student.lastName}`.trim(),
        studentCode: row.student.studentCode,
        quizTitle: row.quiz.title,
        subjectName: row.quiz.subject?.name ?? null,
        classLabel: row.quiz.section
          ? sectionClassLabel(row.quiz.section)
          : null,
        percentage: Number(row.percentage),
        submittedAt: row.submittedAt,
      })),
      examResults: assessmentMarks.map((row) => ({
        id: row.id,
        studentName: `${row.student.firstName} ${row.student.lastName}`.trim(),
        studentCode: row.student.studentCode,
        examName: row.examConfig?.name ?? row.type,
        subjectName: row.subject?.name ?? null,
        classLabel: row.section
          ? sectionClassLabel(row.section)
          : null,
        marksObtained: Number(row.marks),
        maxMarks: Number(row.maxMarks),
        assessedAt: row.assessedAt,
      })),
    };
  }

  async getExamPaperSubmissions(
    user: AuthUser,
    query: {
      examConfigId?: string;
      sectionId?: string;
      subjectId?: string;
      subjectName?: string;
      teacherId?: string;
    },
  ) {
    const sectionIds = await this.assertHeadTeacher(user);
    if (query.sectionId && !sectionIds.includes(query.sectionId)) {
      throw new ForbiddenException({ code: 'SECTION_OUT_OF_SCOPE', message: 'Class not supervised' });
    }
    return this.academicsService.getExamPaperSubmissions(user, {
      ...query,
      restrictSectionIds: query.sectionId ? [query.sectionId] : sectionIds,
    });
  }

  private async requireHeadTeacherProfile(user: AuthUser) {
    if (!user.roles.includes(RoleName.TEACHER)) return null;
    const schoolId = this.tenant.requireSchoolId(user);
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!teacher) return null;

    const assignment = await this.prisma.headTeacherAssignment.findFirst({
      where: { schoolId, teacherId: teacher.id },
      include: {
        sections: {
          include: {
            section: { include: { grade: { select: { id: true, name: true } } } },
          },
        },
      },
    });
    if (!assignment || !assignment.sections.length) return null;

    return {
      assignment,
      sectionIds: assignment.sections.map((row) => row.sectionId),
      sections: assignment.sections.map((row) => row.section),
    };
  }
}
