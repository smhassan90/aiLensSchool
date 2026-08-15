import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
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
  ) {}

  async mark(dto: MarkAttendanceDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const date = new Date(dto.date);

    const results = await this.prisma.$transaction(
      dto.entries.map((entry) =>
        this.prisma.attendance.upsert({
          where: {
            studentId_date: { studentId: entry.studentId, date },
          },
          create: {
            schoolId,
            branchId: dto.branchId,
            academicYearId: dto.academicYearId,
            sectionId: dto.sectionId,
            studentId: entry.studentId,
            date,
            status: entry.status,
            notes: entry.notes,
          },
          update: {
            status: entry.status,
            notes: entry.notes,
            sectionId: dto.sectionId,
          },
        }),
      ),
    );

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
      this.prisma.attendance.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          student: { select: { id: true, firstName: true, lastName: true, studentCode: true } },
        },
      }),
      this.prisma.attendance.count({ where }),
    );
    return paginate(items, total, page, limit);
  }
}
