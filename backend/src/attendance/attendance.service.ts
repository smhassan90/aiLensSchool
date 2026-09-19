import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { NotificationType, Prisma, RoleName } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { MemoryCacheService } from '../common/services/memory-cache.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { ParentsService } from '../parents/parents.service';
import { dateFromIso } from '../teachers/teacher-checkin';
import { NotificationService } from '../notifications/notifications.service';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
    private readonly parentsService: ParentsService,
    private readonly cache: MemoryCacheService,
    private readonly notifications: NotificationService,
  ) {}

  async mark(dto: MarkAttendanceDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);

    if (!dto.academicYearId?.trim() || !dto.branchId?.trim() || !dto.sectionId?.trim()) {
      throw new BadRequestException({
        code: 'ATTENDANCE_CONTEXT_REQUIRED',
        message: 'Academic year, branch, and section are required before saving attendance',
      });
    }
    if (!dto.date?.trim()) {
      throw new BadRequestException({
        code: 'DATE_REQUIRED',
        message: 'Date is required',
      });
    }

    const entries = [
      ...new Map(
        dto.entries
          .filter((entry) => entry.studentId?.trim())
          .map((entry) => [entry.studentId, entry]),
      ).values(),
    ];

    if (!entries.length) {
      return [];
    }

    await this.assertCanMarkSection(user, schoolId, dto.sectionId);

    const date = dateFromIso(dto.date.slice(0, 10));

    // One round-trip upsert for the whole roster (remote MySQL latency dominates N upserts).
    const rows = entries.map((entry) =>
      Prisma.sql`(
        ${randomUUID()},
        ${schoolId},
        ${dto.branchId},
        ${dto.academicYearId},
        ${dto.sectionId},
        ${entry.studentId},
        ${date},
        ${entry.status},
        ${entry.notes ?? null},
        NOW(3),
        NOW(3)
      )`,
    );

    await this.prisma.$executeRaw`
      INSERT INTO attendances (
        id, school_id, branch_id, academic_year_id, section_id, student_id,
        date, status, notes, created_at, updated_at
      )
      VALUES ${Prisma.join(rows)}
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        notes = VALUES(notes),
        section_id = VALUES(section_id),
        branch_id = VALUES(branch_id),
        academic_year_id = VALUES(academic_year_id),
        school_id = VALUES(school_id),
        updated_at = NOW(3)
    `;

    const results = await this.prisma.attendance.findMany({
      where: {
        date,
        studentId: { in: entries.map((entry) => entry.studentId) },
      },
    });

    const absentStudentIds = entries
      .filter((entry) => entry.status === 'ABSENT')
      .map((entry) => entry.studentId);
    if (absentStudentIds.length) {
      const dayOffCoverage = await this.prisma.parentDayOffRequest.findMany({
        where: {
          schoolId,
          studentId: { in: absentStudentIds },
          status: { in: ['PENDING', 'APPROVED'] },
          startDate: { lte: date },
          endDate: { gte: date },
        },
        select: { studentId: true },
      });
      const coveredIds = new Set(dayOffCoverage.map((request) => request.studentId));
      const unexplainedIds = absentStudentIds.filter((studentId) => !coveredIds.has(studentId));
      if (unexplainedIds.length) {
        const links = await this.prisma.studentParent.findMany({
          where: { studentId: { in: unexplainedIds } },
          select: { parent: { select: { userId: true } } },
        });
        await this.notifications.createForUsers(
          [...new Set(links.map((link) => link.parent.userId))],
          {
            schoolId,
            type: NotificationType.STUDENT_ABSENCE,
            title: 'Attendance follow-up',
            body: 'We noticed your child was marked absent today. If you have a moment, please let the school know the reason through the app or by calling the office.',
            data: { studentIds: unexplainedIds, date: dto.date } as Prisma.InputJsonValue,
            deepLink: '/attendance',
          },
        );
      }
    }

    this.cache.invalidatePrefix(`teacher:summary:`);
    this.cache.invalidatePrefix(`teacher:coach:`);

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      branchId: dto.branchId,
      action: 'ATTENDANCE_MARKED',
      entityType: 'Attendance',
      metadata: { date: dto.date, count: results.length },
    });

    return results;
  }

  async findAll(
    user: AuthUser,
    query: PaginationDto & {
      sectionId?: string;
      studentId?: string;
      date?: string;
    },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    if (this.tenant.isParent(user)) {
      if (!query.studentId) {
        throw new ForbiddenException({
          code: 'STUDENT_ID_REQUIRED',
          message: 'studentId is required for parent attendance view',
        });
      }
      await this.parentsService.assertParentOwnsStudent(user.id, query.studentId);
    }

    const schoolId = this.tenant.requireSchoolId(user);
    const where: Prisma.AttendanceWhereInput = {
      schoolId,
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.date ? { date: dateFromIso(query.date.slice(0, 10)) } : {}),
    };

    const [items, total] = await pageQuery(
      (skip, take) =>
        this.prisma.attendance.findMany({
          where,
          orderBy: { date: 'desc' },
          skip,
          take,
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                studentCode: true,
                dayOffRequests: {
                  where: {
                    status: { in: ['PENDING', 'APPROVED'] },
                    startDate: { lte: query.date ? dateFromIso(query.date.slice(0, 10)) : new Date() },
                    endDate: { gte: query.date ? dateFromIso(query.date.slice(0, 10)) : new Date() },
                  },
                  select: { id: true, startDate: true, endDate: true, reason: true, status: true },
                },
              },
            },
          },
        }),
      () => this.prisma.attendance.count({ where }),
      page,
      limit,
    );
    return paginate(items, total, page, limit);
  }

  /** Only school admins or the section's class teacher may mark student attendance. */
  private async assertCanMarkSection(user: AuthUser, schoolId: string, sectionId: string) {
    if (user.roles.includes(RoleName.SCHOOL_ADMIN) || user.roles.includes(RoleName.SUPER_ADMIN)) {
      return;
    }
    if (!this.tenant.isTeacher(user)) {
      throw new ForbiddenException({
        code: 'ATTENDANCE_FORBIDDEN',
        message: 'Only class teachers can mark attendance',
      });
    }
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, schoolId },
      select: {
        id: true,
        classTeacherId: true,
        classTeacher: { select: { userId: true } },
      },
    });
    if (!section) {
      throw new ForbiddenException({
        code: 'SECTION_NOT_FOUND',
        message: 'Class section not found',
      });
    }
    if (!section.classTeacherId || section.classTeacher?.userId !== user.id) {
      throw new ForbiddenException({
        code: 'NOT_CLASS_TEACHER',
        message: 'Only the class teacher of this section can mark attendance',
      });
    }
  }
}
