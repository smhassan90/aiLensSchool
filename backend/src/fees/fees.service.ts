import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StudentFeeStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import {
  AssignFeesDto,
  CreateFeeStructureDto,
  RecordPaymentDto,
} from './dto/fees.dto';

function money(value: Prisma.Decimal | number | string) {
  return Number(value);
}

@Injectable()
export class FeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
  ) {}

  async createStructure(dto: CreateFeeStructureDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    try {
      const structure = await this.prisma.feeStructure.create({
        data: {
          schoolId,
          name: dto.name,
          amount: dto.amount,
          frequency: dto.frequency ?? 'MONTHLY',
          description: dto.description,
          active: dto.active ?? true,
        },
      });
      await this.audit.log({
        actorUserId: user.id,
        schoolId,
        action: 'FEE_STRUCTURE_CREATED',
        entityType: 'FeeStructure',
        entityId: structure.id,
      });
      return structure;
    } catch {
      throw new BadRequestException({
        code: 'FEE_STRUCTURE_EXISTS',
        message: 'A fee with this name already exists',
      });
    }
  }

  async listStructures(user: AuthUser, query: PaginationDto) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where = { schoolId };
    const [items, total] = await pageQuery(
      this.prisma.feeStructure.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.feeStructure.count({ where }),
    );
    return paginate(items, total, page, limit);
  }

  async assign(dto: AssignFeesDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const structure = await this.prisma.feeStructure.findFirst({
      where: { id: dto.feeStructureId, schoolId },
    });
    if (!structure) {
      throw new NotFoundException({ code: 'FEE_STRUCTURE_NOT_FOUND', message: 'Fee type not found' });
    }

    const year = await this.prisma.academicYear.findFirst({
      where: { id: dto.academicYearId, schoolId },
    });
    if (!year) {
      throw new NotFoundException({ code: 'YEAR_NOT_FOUND', message: 'Academic year not found' });
    }

    let studentIds = dto.studentIds ?? [];
    if (dto.sectionId) {
      const enrolled = await this.prisma.studentEnrollment.findMany({
        where: {
          sectionId: dto.sectionId,
          academicYearId: dto.academicYearId,
          status: 'ACTIVE',
        },
        select: { studentId: true, student: { select: { branchId: true } } },
      });
      studentIds = enrolled.map((e) => e.studentId);
    }

    if (!studentIds.length) {
      throw new BadRequestException({
        code: 'NO_STUDENTS',
        message: 'Select students or a section with enrollments',
      });
    }

    const students = await this.prisma.student.findMany({
      where: { id: { in: studentIds }, schoolId },
      include: {
        enrollments: {
          where: { academicYearId: dto.academicYearId, status: 'ACTIVE' },
          take: 1,
        },
      },
    });

    const created = [];
    for (const student of students) {
      const fee = await this.prisma.studentFee.upsert({
        where: {
          studentId_feeStructureId_periodLabel: {
            studentId: student.id,
            feeStructureId: structure.id,
            periodLabel: dto.periodLabel,
          },
        },
        create: {
          schoolId,
          branchId: student.branchId,
          studentId: student.id,
          feeStructureId: structure.id,
          academicYearId: dto.academicYearId,
          sectionId: student.enrollments[0]?.sectionId ?? dto.sectionId,
          periodLabel: dto.periodLabel,
          amount: structure.amount,
          dueDate: new Date(dto.dueDate),
          status: StudentFeeStatus.DUE,
        },
        update: {
          amount: structure.amount,
          dueDate: new Date(dto.dueDate),
        },
      });
      created.push(fee);
    }

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'FEES_ASSIGNED',
      entityType: 'StudentFee',
      metadata: { count: created.length, period: dto.periodLabel },
    });

    return { assigned: created.length, items: created };
  }

  async listStudentFees(
    user: AuthUser,
    query: PaginationDto & {
      search?: string;
      status?: StudentFeeStatus;
      studentId?: string;
      sectionId?: string;
    },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where: Prisma.StudentFeeWhereInput = {
      schoolId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.search
        ? {
            student: {
              OR: [
                { firstName: { contains: query.search } },
                { lastName: { contains: query.search } },
                { studentCode: { contains: query.search } },
                { admissionNumber: { contains: query.search } },
              ],
            },
          }
        : {}),
    };

    const [items, total] = await pageQuery(
      this.prisma.studentFee.findMany({
        where,
        orderBy: { dueDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          amount: true,
          paidAmount: true,
          dueDate: true,
          status: true,
          periodLabel: true,
          student: { select: { id: true, firstName: true, lastName: true, studentCode: true } },
          feeStructure: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
        },
      }),
      this.prisma.studentFee.count({ where }),
    );

    return paginate(
      items.map((item) => ({
        ...item,
        amount: money(item.amount),
        paidAmount: money(item.paidAmount),
        balance: Number((money(item.amount) - money(item.paidAmount)).toFixed(2)),
      })),
      total,
      page,
      limit,
    );
  }

  async recordPayment(dto: RecordPaymentDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const fee = await this.prisma.studentFee.findFirst({
      where: { id: dto.studentFeeId, schoolId },
    });
    if (!fee) {
      throw new NotFoundException({ code: 'STUDENT_FEE_NOT_FOUND', message: 'Fee record not found' });
    }

    const paid = money(fee.paidAmount) + dto.amount;
    const amount = money(fee.amount);
    if (paid - amount > 0.009) {
      throw new BadRequestException({
        code: 'PAYMENT_EXCEEDS_DUE',
        message: 'Payment is more than the outstanding balance',
      });
    }

    let status: StudentFeeStatus = StudentFeeStatus.PARTIAL;
    if (paid <= 0) status = StudentFeeStatus.DUE;
    if (Math.abs(paid - amount) < 0.01) status = StudentFeeStatus.PAID;

    const [payment] = await this.prisma.$transaction([
      this.prisma.feePayment.create({
        data: {
          studentFeeId: fee.id,
          amount: dto.amount,
          method: dto.method ?? 'CASH',
          reference: dto.reference,
          notes: dto.notes,
          recordedById: user.id,
        },
      }),
      this.prisma.studentFee.update({
        where: { id: fee.id },
        data: { paidAmount: paid, status },
      }),
    ]);

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'FEE_PAYMENT_RECORDED',
      entityType: 'FeePayment',
      entityId: payment.id,
    });

    return { ...payment, amount: money(payment.amount), status };
  }
}
