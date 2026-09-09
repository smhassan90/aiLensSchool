import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, RoleName } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { MemoryCacheService } from '../common/services/memory-cache.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { ParentsService } from '../parents/parents.service';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
    private readonly parentsService: ParentsService,
    private readonly cache: MemoryCacheService,
  ) {}

  async mark(dto: MarkAttendanceDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const date = new Date(dto.date);

    if (!dto.entries.length) {
      return [];
    }

    await this.assertCanMarkSection(user, schoolId, dto.sectionId);

    // One round-trip upsert for the whole roster (remote MySQL latency dominates N upserts).
    const rows = dto.entries.map((entry) =>
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
        studentId: { in: dto.entries.map((entry) => entry.studentId) },
      },
    });

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
      ...(query.date ? { date: new Date(query.date) } : {}),
    };

    const [items, total] = await pageQuery(
      (skip, take) =>
        this.prisma.attendance.findMany({
          where,
          orderBy: { date: 'desc' },
          skip,
          take,
          include: {
            student: { select: { id: true, firstName: true, lastName: true, studentCode: true } },
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
