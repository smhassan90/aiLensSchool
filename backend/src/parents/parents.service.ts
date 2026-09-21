import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DayOffRequestStatus, EnrollmentStatus, NotificationType, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import { generateParentPassword } from '../students/parent-accounts';
import { NotificationService } from '../notifications/notifications.service';
import { CreateDayOffDto, DayOffQueryDto, ReviewDayOffDto } from './dto/day-off.dto';

@Injectable()
export class ParentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  async findAll(user: AuthUser, query: PaginationDto & { search?: string }) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ParentProfileWhereInput = {
      schoolId,
      ...(query.search
        ? {
            OR: [
              { user: { firstName: { contains: query.search } } },
              { user: { lastName: { contains: query.search } } },
              { user: { email: { contains: query.search } } },
              { user: { username: { contains: query.search } } },
              { user: { phone: { contains: query.search } } },
              { phone: { contains: query.search } },
              {
                students: {
                  some: {
                    student: {
                      OR: [
                        { firstName: { contains: query.search } },
                        { lastName: { contains: query.search } },
                        { studentCode: { contains: query.search } },
                      ],
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await pageQuery(
      this.prisma.parentProfile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              firstName: true,
              lastName: true,
              phone: true,
              status: true,
            },
          },
          students: {
            include: {
              student: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  studentCode: true,
                  status: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.parentProfile.count({ where }),
    );

    return paginate(items, total, page, limit);
  }

  async getChildren(parentUserId: string) {
    const parent = await this.prisma.parentProfile.findUnique({
      where: { userId: parentUserId },
      include: {
        students: {
          include: {
            student: {
              include: {
                branch: true,
                enrollments: {
                  where: { status: 'ACTIVE' },
                  include: { grade: true, section: true, academicYear: true },
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_PROFILE_NOT_FOUND',
        message: 'Parent profile not found',
      });
    }
    return parent.students.map((sp) => ({
      relationship: sp.relationship,
      isPrimary: sp.isPrimary,
      student: sp.student,
    }));
  }

  async resetPassword(id: string, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const parent = await this.prisma.parentProfile.findFirst({
      where: { id, schoolId },
      select: {
        id: true,
        userId: true,
        user: { select: { id: true, username: true, firstName: true, lastName: true } },
      },
    });
    if (!parent) {
      throw new NotFoundException({ code: 'PARENT_NOT_FOUND', message: 'Parent not found' });
    }

    const temporaryPassword = generateParentPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: parent.userId },
        data: {
          passwordHash,
          mustChangePassword: true,
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: parent.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'PARENT_PASSWORD_RESET',
      entityType: 'ParentProfile',
      entityId: parent.id,
    });

    return {
      parentId: parent.id,
      username: parent.user.username,
      temporaryPassword,
      mustChangePassword: true,
    };
  }

  async createDayOffRequest(dto: CreateDayOffDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const startDate = this.dayOnly(dto.startDate);
    const endDate = this.dayOnly(dto.endDate);
    const today = this.dayOnly(new Date().toISOString());
    if (endDate < startDate || startDate < today) {
      throw new BadRequestException({
        code: 'INVALID_DAY_OFF_RANGE',
        message: 'Day off must be a valid current or future date range',
      });
    }

    const parent = await this.prisma.parentProfile.findFirst({
      where: {
        userId: user.id,
        schoolId,
        students: { some: { studentId: dto.studentId } },
      },
      select: { id: true },
    });
    if (!parent) {
      throw new ForbiddenException({ code: 'PARENT_STUDENT_FORBIDDEN', message: 'Student is not linked to this parent' });
    }

    const overlapping = await this.prisma.parentDayOffRequest.findFirst({
      where: {
        studentId: dto.studentId,
        status: { in: [DayOffRequestStatus.PENDING, DayOffRequestStatus.APPROVED] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    if (overlapping) {
      throw new BadRequestException({ code: 'DAY_OFF_OVERLAPS', message: 'An overlapping day-off request already exists' });
    }

    const request = await this.prisma.parentDayOffRequest.create({
      data: {
        schoolId,
        studentId: dto.studentId,
        parentId: parent.id,
        startDate,
        endDate,
        reason: dto.reason.trim(),
      },
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            enrollments: {
              where: { status: EnrollmentStatus.ACTIVE },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                section: {
                  select: {
                    name: true,
                    grade: { select: { name: true } },
                    classTeacher: { select: { userId: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const studentName = `${request.student.firstName} ${request.student.lastName}`.trim();
    const enrollment = request.student.enrollments[0];
    const classTeacherUserId = enrollment?.section?.classTeacher?.userId ?? null;
    const classLabel = enrollment?.section
      ? `${enrollment.section.grade.name} ${enrollment.section.name}`
      : 'their class';
    const dateLabel = `${startDate.toISOString().slice(0, 10)} → ${endDate.toISOString().slice(0, 10)}`;

    if (classTeacherUserId) {
      await this.notifications.createForUsers([classTeacherUserId], {
        schoolId,
        type: NotificationType.DAY_OFF_REQUESTED,
        title: `Day-off request: ${studentName}`,
        body: `${studentName} (${classLabel}) requested day off ${dateLabel}.`,
        data: { dayOffRequestId: request.id, studentId: dto.studentId } as Prisma.InputJsonValue,
        deepLink: '/teacher/day-off-requests',
      });
    }

    return request;
  }

  async listDayOffRequests(query: DayOffQueryDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const day = query.date ? this.dayOnly(query.date) : null;
    const classTeacherFilter = await this.classTeacherStudentFilter(user);
    const studentFilters: Prisma.StudentWhereInput[] = [];
    if (query.sectionId) {
      studentFilters.push({
        enrollments: {
          some: { sectionId: query.sectionId, status: EnrollmentStatus.ACTIVE },
        },
      });
    }
    if (classTeacherFilter) {
      studentFilters.push(classTeacherFilter);
    }
    const where: Prisma.ParentDayOffRequestWhereInput = {
      schoolId,
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(studentFilters.length ? { student: { AND: studentFilters } } : {}),
      ...(query.status ? { status: query.status as DayOffRequestStatus } : {}),
      ...(day
        ? {
            startDate: { lte: day },
            endDate: { gte: day },
            status: { in: [DayOffRequestStatus.PENDING, DayOffRequestStatus.APPROVED] },
          }
        : {}),
      ...(this.tenant.isParent(user) ? { parent: { userId: user.id } } : {}),
    };
    return this.prisma.parentDayOffRequest.findMany({
      where,
      orderBy: [{ startDate: 'asc' }, { createdAt: 'desc' }],
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentCode: true,
            enrollments: {
              where: { status: EnrollmentStatus.ACTIVE },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                section: {
                  select: { name: true, grade: { select: { name: true } } },
                },
              },
            },
          },
        },
        parent: { include: { user: { select: { firstName: true, lastName: true, username: true } } } },
      },
    });
  }

  async deleteDayOffRequest(id: string, user: AuthUser) {
    const request = await this.prisma.parentDayOffRequest.findFirst({
      where: { id, parent: { userId: user.id, schoolId: this.tenant.requireSchoolId(user) } },
    });
    if (!request) throw new NotFoundException({ code: 'DAY_OFF_NOT_FOUND', message: 'Day-off request not found' });
    if (request.startDate <= this.dayOnly(new Date().toISOString())) {
      throw new BadRequestException({ code: 'DAY_OFF_LOCKED', message: 'A day-off cannot be cancelled on or after its start date' });
    }
    return this.prisma.parentDayOffRequest.delete({ where: { id } });
  }

  async reviewDayOffRequest(id: string, dto: ReviewDayOffDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const request = await this.prisma.parentDayOffRequest.findFirst({
      where: { id, schoolId },
      include: { parent: { select: { userId: true } } },
    });
    if (!request) throw new NotFoundException({ code: 'DAY_OFF_NOT_FOUND', message: 'Day-off request not found' });
    await this.assertClassTeacherForStudent(user, request.studentId);
    if (request.status !== DayOffRequestStatus.PENDING) {
      throw new BadRequestException({ code: 'DAY_OFF_ALREADY_REVIEWED', message: 'This request has already been reviewed' });
    }
    const updated = await this.prisma.parentDayOffRequest.update({
      where: { id },
      data: {
        status: dto.status as DayOffRequestStatus,
        reviewNote: dto.reviewNote?.trim() || null,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    });
    await this.notifications.createForUsers([request.parent.userId], {
      schoolId,
      type: NotificationType.DAY_OFF_DECISION,
      title: `Day-off request ${dto.status.toLowerCase()}`,
      body: dto.reviewNote?.trim() || `Your day-off request was ${dto.status.toLowerCase()}.`,
      data: { dayOffRequestId: id, status: dto.status } as Prisma.InputJsonValue,
      deepLink: '/day-off',
    });
    return updated;
  }

  private dayOnly(value: string) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException({ code: 'INVALID_DATE', message: 'Invalid date' });
    return date;
  }

  private async classTeacherStudentFilter(user: AuthUser) {
    if (!this.tenant.isTeacher(user) || this.tenant.isSchoolStaff(user)) return undefined;
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!teacher) {
      throw new ForbiddenException({ code: 'TEACHER_PROFILE_NOT_FOUND', message: 'Teacher profile not found' });
    }
    return {
      enrollments: {
        some: {
          status: EnrollmentStatus.ACTIVE,
          section: { classTeacherId: teacher.id },
        },
      },
    } satisfies Prisma.StudentWhereInput;
  }

  private async assertClassTeacherForStudent(user: AuthUser, studentId: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!teacher) {
      throw new ForbiddenException({ code: 'TEACHER_PROFILE_NOT_FOUND', message: 'Teacher profile not found' });
    }
    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: {
        studentId,
        status: EnrollmentStatus.ACTIVE,
        section: { schoolId, classTeacherId: teacher.id },
      },
      select: { id: true },
    });
    if (!enrollment) {
      throw new ForbiddenException({
        code: 'CLASS_TEACHER_REQUIRED',
        message: 'Only the class teacher can approve or reject this day-off request',
      });
    }
  }

  async getParentChildren(parentProfileId: string, user: AuthUser) {
    const parent = await this.prisma.parentProfile.findUnique({
      where: { id: parentProfileId },
      include: {
        students: {
          include: {
            student: {
              include: {
                branch: true,
                enrollments: {
                  where: { status: 'ACTIVE' },
                  include: { grade: true, section: true, academicYear: true },
                },
              },
            },
          },
        },
      },
    });
    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_NOT_FOUND',
        message: 'Parent not found',
      });
    }
    this.tenant.assertSchoolAccess(user, parent.schoolId);
    return parent.students.map((sp) => ({
      relationship: sp.relationship,
      isPrimary: sp.isPrimary,
      student: sp.student,
    }));
  }

  async assertParentOwnsStudent(parentUserId: string, studentId: string) {
    const parent = await this.prisma.parentProfile.findUnique({
      where: { userId: parentUserId },
      include: { students: true },
    });
    if (!parent || !parent.students.some((sp) => sp.studentId === studentId)) {
      throw new ForbiddenException({
        code: 'CHILD_ACCESS_DENIED',
        message: 'Parent does not have access to this student',
      });
    }
    return parent;
  }

  async getActiveEnrollment(parentUserId: string, studentId: string) {
    const parent = await this.assertParentOwnsStudent(parentUserId, studentId);
    const currentYear = await this.prisma.academicYear.findFirst({
      where: { schoolId: parent.schoolId, isCurrent: true },
      orderBy: { startDate: 'desc' },
      select: { id: true },
    });
    if (currentYear) {
      const current = await this.prisma.studentEnrollment.findFirst({
        where: { studentId, status: 'ACTIVE', academicYearId: currentYear.id },
        orderBy: { createdAt: 'desc' },
      });
      if (current) return current;
    }
    return this.prisma.studentEnrollment.findFirst({
      where: { studentId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async assertParentChildInSection(parentUserId: string, studentId: string, sectionId: string) {
    const enrollment = await this.getActiveEnrollment(parentUserId, studentId);
    if (!enrollment || enrollment.sectionId !== sectionId) {
      throw new ForbiddenException({
        code: 'CHILD_ACCESS_DENIED',
        message: 'This item is not for the selected child',
      });
    }
    return enrollment;
  }
}
