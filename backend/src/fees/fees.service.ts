import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentStatus, Prisma, StudentFeeStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import {
  AssignFeesDto,
  CollectFeeDto,
  CreateFeeStructureDto,
  MarkPaidDto,
  RecordPaymentDto,
} from './dto/fees.dto';
import { ParentsService } from '../parents/parents.service';
import { positiveAmount, classFeeName } from './class-fees';
import { studentSearchWhere } from '../common/utils/student-search';

function money(value: Prisma.Decimal | number | string | null | undefined | unknown) {
  return Number(value ?? 0);
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function monthRange(month?: string) {
  const now = new Date();
  let year = now.getFullYear();
  let monthIndex = now.getMonth();
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    year = Number(month.slice(0, 4));
    monthIndex = Number(month.slice(5, 7)) - 1;
  }
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 1);
  return {
    start,
    end,
    label: start.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
  };
}

function outstandingOf(fee: { amount: unknown; paidAmount: unknown; discountAmount?: unknown }) {
  return round2(Math.max(0, money(fee.amount) - money(fee.paidAmount) - money(fee.discountAmount)));
}

function currentPeriodLabel(date = new Date()) {
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function lastDayOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function parentDisplay(parent: {
  relationship?: string | null;
  parent?: {
    phone?: string | null;
    user?: { firstName?: string | null; lastName?: string | null; phone?: string | null } | null;
  } | null;
}) {
  const user = parent.parent?.user;
  const name = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.replace(/\s+/g, ' ').trim();
  const phone = parent.parent?.phone || user?.phone || '';
  return {
    relationship: parent.relationship ?? 'GUARDIAN',
    name,
    phone,
  };
}

@Injectable()
export class FeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
    private readonly parentsService: ParentsService,
  ) {}

  private async findTuitionStructure(schoolId: string, grade: { id: string; name: string }) {
    return (
      (await this.prisma.feeStructure.findFirst({
        where: { schoolId, gradeId: grade.id, kind: 'TUITION' },
      })) ??
      (await this.prisma.feeStructure.findFirst({
        where: { schoolId, name: classFeeName(grade.name, 'TUITION') },
      }))
    );
  }

  async createStructure(dto: CreateFeeStructureDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    let gradeId: string | undefined;
    let name = dto.name.trim();
    if (dto.gradeId) {
      const grade = await this.prisma.grade.findFirst({
        where: { id: dto.gradeId, schoolId },
        select: { id: true, name: true },
      });
      if (!grade) {
        throw new NotFoundException({ code: 'GRADE_NOT_FOUND', message: 'Class not found' });
      }
      gradeId = grade.id;
      if (!name.toLowerCase().includes(grade.name.toLowerCase())) {
        name = `${grade.name} ${name}`;
      }
    }
    try {
      const structure = await this.prisma.feeStructure.create({
        data: {
          schoolId,
          gradeId,
          kind: 'OTHER',
          name,
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

  async listStructures(user: AuthUser, query: PaginationDto & { gradeId?: string }) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where = { schoolId, ...(query.gradeId ? { gradeId: query.gradeId } : {}) };
    const [items, total] = await pageQuery(
      this.prisma.feeStructure.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { grade: { select: { id: true, name: true } } },
      }),
      this.prisma.feeStructure.count({ where }),
    );
    return paginate(items, total, page, limit);
  }

  async listBrackets(user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const [grades, structures] = await Promise.all([
      this.prisma.grade.findMany({
        where: { schoolId, tuitionFee: { not: null } },
        select: { tuitionFee: true },
      }),
      this.prisma.feeStructure.findMany({
        where: { schoolId, active: true, frequency: 'MONTHLY' },
        select: { amount: true },
      }),
    ]);
    const amounts = new Set<number>();
    for (const grade of grades) {
      const value = money(grade.tuitionFee);
      if (value > 0) amounts.add(value);
    }
    for (const structure of structures) {
      const value = money(structure.amount);
      if (value > 0) amounts.add(value);
    }
    return {
      amounts: [...amounts].sort((a, b) => a - b),
    };
  }

  async assign(dto: AssignFeesDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);

    const year = await this.prisma.academicYear.findFirst({
      where: { id: dto.academicYearId, schoolId },
    });
    if (!year) {
      throw new NotFoundException({ code: 'YEAR_NOT_FOUND', message: 'Academic year not found' });
    }

    const bracket = positiveAmount(dto.amount ?? null);

    // Fee-bracket flow: set tuition on selected stage/class, then bill students
    if (bracket && (dto.stageId || dto.gradeId)) {
      if (dto.stageId) {
        const stage = await this.prisma.schoolStage.findFirst({
          where: { id: dto.stageId, schoolId },
          select: { id: true, name: true },
        });
        if (!stage) {
          throw new NotFoundException({ code: 'STAGE_NOT_FOUND', message: 'School section not found' });
        }
      }

      const grades = await this.prisma.grade.findMany({
        where: {
          schoolId,
          ...(dto.stageId ? { stageId: dto.stageId } : {}),
          ...(dto.gradeId ? { id: dto.gradeId } : {}),
        },
        select: { id: true, name: true },
        orderBy: { level: 'asc' },
      });

      if (!grades.length) {
        throw new BadRequestException({
          code: 'NO_CLASSES',
          message: 'No classes found in that school section. Assign classes to the section first.',
        });
      }

      const gradeIds = grades.map((g) => g.id);
      await this.prisma.grade.updateMany({
        where: { id: { in: gradeIds } },
        data: { tuitionFee: bracket },
      });

      // One tuition fee structure per class (not per student)
      const structureByGradeId = new Map<string, { id: string; amount: unknown }>();
      await Promise.all(
        grades.map(async (grade) => {
          const name = classFeeName(grade.name, 'TUITION');
          const feeStructure = await this.prisma.feeStructure.upsert({
            where: { schoolId_name: { schoolId, name } },
            create: {
              schoolId,
              gradeId: grade.id,
              kind: 'TUITION',
              name,
              amount: bracket,
              frequency: 'MONTHLY',
              description: `Monthly tuition for ${grade.name}`,
            },
            update: {
              amount: bracket,
              gradeId: grade.id,
              kind: 'TUITION',
              active: true,
            },
          });
          structureByGradeId.set(grade.id, feeStructure);
        }),
      );

      const enrollments = await this.prisma.studentEnrollment.findMany({
        where: {
          academicYearId: dto.academicYearId,
          status: 'ACTIVE',
          gradeId: { in: gradeIds },
        },
        select: {
          studentId: true,
          sectionId: true,
          gradeId: true,
          student: { select: { branchId: true } },
        },
      });

      const dueDate = new Date(dto.dueDate);
      const chunkSize = 25;
      let assigned = 0;
      for (let i = 0; i < enrollments.length; i += chunkSize) {
        const chunk = enrollments.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (enrollment) => {
            const feeStructure = structureByGradeId.get(enrollment.gradeId);
            if (!feeStructure) return;
            await this.prisma.studentFee.upsert({
              where: {
                studentId_feeStructureId_periodLabel: {
                  studentId: enrollment.studentId,
                  feeStructureId: feeStructure.id,
                  periodLabel: dto.periodLabel,
                },
              },
              create: {
                schoolId,
                branchId: enrollment.student.branchId,
                studentId: enrollment.studentId,
                feeStructureId: feeStructure.id,
                academicYearId: dto.academicYearId,
                sectionId: enrollment.sectionId,
                periodLabel: dto.periodLabel,
                amount: bracket,
                dueDate,
                status: StudentFeeStatus.DUE,
              },
              update: {
                amount: bracket,
                dueDate,
              },
            });
            assigned += 1;
          }),
        );
      }

      await this.audit.log({
        actorUserId: user.id,
        schoolId,
        action: 'FEES_BRACKET_ASSIGNED',
        entityType: 'StudentFee',
        metadata: {
          amount: bracket,
          classesUpdated: grades.length,
          assigned,
          period: dto.periodLabel,
          stageId: dto.stageId ?? null,
          gradeId: dto.gradeId ?? null,
          classNames: grades.map((g) => g.name),
        },
      });

      return {
        assigned,
        classesUpdated: grades.length,
        amount: bracket,
        classes: grades.map((g) => g.name),
      };
    }

    const useClassTuition = Boolean(dto.useClassTuition || (dto.stageId && !dto.feeStructureId));
    let structure =
      dto.feeStructureId
        ? await this.prisma.feeStructure.findFirst({
            where: { id: dto.feeStructureId, schoolId },
          })
        : null;
    if (dto.feeStructureId && !structure) {
      throw new NotFoundException({ code: 'FEE_STRUCTURE_NOT_FOUND', message: 'Fee type not found' });
    }
    if (!useClassTuition && !structure) {
      throw new BadRequestException({
        code: 'FEE_TYPE_REQUIRED',
        message: 'Select a fee bracket amount and a school section or class',
      });
    }

    let enrollments: Array<{
      studentId: string;
      sectionId: string;
      student: { branchId: string };
      grade: { id: string; name: string; tuitionFee: unknown };
    }> = [];

    if (dto.stageId) {
      const stage = await this.prisma.schoolStage.findFirst({
        where: { id: dto.stageId, schoolId },
        select: { id: true },
      });
      if (!stage) {
        throw new NotFoundException({ code: 'STAGE_NOT_FOUND', message: 'School section not found' });
      }
      enrollments = await this.prisma.studentEnrollment.findMany({
        where: {
          academicYearId: dto.academicYearId,
          status: 'ACTIVE',
          grade: { schoolId, stageId: dto.stageId },
        },
        select: {
          studentId: true,
          sectionId: true,
          student: { select: { branchId: true } },
          grade: { select: { id: true, name: true, tuitionFee: true } },
        },
      });
    } else if (dto.gradeId) {
      enrollments = await this.prisma.studentEnrollment.findMany({
        where: {
          academicYearId: dto.academicYearId,
          status: 'ACTIVE',
          gradeId: dto.gradeId,
          grade: { schoolId },
        },
        select: {
          studentId: true,
          sectionId: true,
          student: { select: { branchId: true } },
          grade: { select: { id: true, name: true, tuitionFee: true } },
        },
      });
    } else if (dto.sectionId) {
      enrollments = await this.prisma.studentEnrollment.findMany({
        where: {
          sectionId: dto.sectionId,
          academicYearId: dto.academicYearId,
          status: 'ACTIVE',
        },
        select: {
          studentId: true,
          sectionId: true,
          student: { select: { branchId: true } },
          grade: { select: { id: true, name: true, tuitionFee: true } },
        },
      });
    } else if (dto.studentIds?.length) {
      enrollments = await this.prisma.studentEnrollment.findMany({
        where: {
          academicYearId: dto.academicYearId,
          status: 'ACTIVE',
          studentId: { in: dto.studentIds },
          student: { schoolId },
        },
        select: {
          studentId: true,
          sectionId: true,
          student: { select: { branchId: true } },
          grade: { select: { id: true, name: true, tuitionFee: true } },
        },
      });
    }

    if (!enrollments.length) {
      throw new BadRequestException({
        code: 'NO_STUDENTS',
        message: 'No enrolled students found for that school section or class',
      });
    }

    const created = [];
    for (const enrollment of enrollments) {
      let feeStructure = structure;
      if (useClassTuition) {
        feeStructure = await this.findTuitionStructure(schoolId, enrollment.grade);
        const billed =
          enrollment.grade.tuitionFee != null ? money(enrollment.grade.tuitionFee) : money(feeStructure?.amount ?? 0);
        if (!feeStructure && billed > 0) {
          const name = classFeeName(enrollment.grade.name, 'TUITION');
          feeStructure = await this.prisma.feeStructure.upsert({
            where: { schoolId_name: { schoolId, name } },
            create: {
              schoolId,
              gradeId: enrollment.grade.id,
              kind: 'TUITION',
              name,
              amount: billed,
              frequency: 'MONTHLY',
              description: `Monthly tuition for ${enrollment.grade.name}`,
            },
            update: {
              amount: billed,
              gradeId: enrollment.grade.id,
              kind: 'TUITION',
              active: true,
            },
          });
        }
        if (!feeStructure) {
          continue;
        }
      }
      if (!feeStructure) continue;

      const fee = await this.prisma.studentFee.upsert({
        where: {
          studentId_feeStructureId_periodLabel: {
            studentId: enrollment.studentId,
            feeStructureId: feeStructure.id,
            periodLabel: dto.periodLabel,
          },
        },
        create: {
          schoolId,
          branchId: enrollment.student.branchId,
          studentId: enrollment.studentId,
          feeStructureId: feeStructure.id,
          academicYearId: dto.academicYearId,
          sectionId: enrollment.sectionId,
          periodLabel: dto.periodLabel,
          amount: feeStructure.amount,
          dueDate: new Date(dto.dueDate),
          status: StudentFeeStatus.DUE,
        },
        update: {
          amount: feeStructure.amount,
          dueDate: new Date(dto.dueDate),
        },
      });
      created.push(fee);
    }

    if (!created.length) {
      throw new BadRequestException({
        code: 'NO_FEES_CREATED',
        message: 'No class tuition is set for students in this selection',
      });
    }

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'FEES_ASSIGNED',
      entityType: 'StudentFee',
      metadata: {
        count: created.length,
        period: dto.periodLabel,
        stageId: dto.stageId ?? null,
        gradeId: dto.gradeId ?? null,
        sectionId: dto.sectionId ?? null,
        useClassTuition,
      },
    });

    return { assigned: created.length, items: created };
  }

  async classMonthStatus(
    user: AuthUser,
    query: { gradeId?: string; sectionId?: string; month?: string },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    if (!query.gradeId && !query.sectionId) {
      throw new BadRequestException({
        code: 'CLASS_REQUIRED',
        message: 'gradeId or sectionId is required',
      });
    }

    const sections = await this.prisma.section.findMany({
      where: {
        schoolId,
        ...(query.sectionId ? { id: query.sectionId } : { gradeId: query.gradeId }),
      },
      select: { id: true, name: true },
    });
    if (!sections.length) {
      throw new NotFoundException({
        code: 'SECTION_NOT_FOUND',
        message: 'Class section not found',
      });
    }

    const sectionIds = sections.map((section) => section.id);
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      orderBy: { startDate: 'desc' },
      select: { id: true },
    });
    const range = monthRange(query.month);

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: {
        sectionId: { in: sectionIds },
        status: EnrollmentStatus.ACTIVE,
        ...(year ? { academicYearId: year.id } : {}),
      },
      select: {
        studentId: true,
        section: { select: { id: true, name: true } },
        student: { select: { id: true, firstName: true, lastName: true, studentCode: true } },
      },
      orderBy: { student: { firstName: 'asc' } },
    });

    const studentIds = enrollments.map((row) => row.studentId);
    const fees = studentIds.length
      ? await this.prisma.studentFee.findMany({
          where: {
            schoolId,
            studentId: { in: studentIds },
            OR: [{ dueDate: { gte: range.start, lt: range.end } }, { periodLabel: range.label }],
          },
          select: {
            studentId: true,
            amount: true,
            paidAmount: true,
            discountAmount: true,
            status: true,
          },
        })
      : [];

    const feesByStudent = new Map<string, typeof fees>();
    for (const fee of fees) {
      const list = feesByStudent.get(fee.studentId) ?? [];
      list.push(fee);
      feesByStudent.set(fee.studentId, list);
    }

    const items = enrollments.map((row) => {
      const studentFees = feesByStudent.get(row.studentId) ?? [];
      const billed = round2(studentFees.reduce((sum, fee) => sum + money(fee.amount), 0));
      const paid = round2(studentFees.reduce((sum, fee) => sum + money(fee.paidAmount), 0));
      const remaining = round2(
        studentFees.reduce((sum, fee) => {
          if (fee.status === StudentFeeStatus.WAIVED) return sum;
          return sum + outstandingOf(fee);
        }, 0),
      );
      let status: 'PAID' | 'PARTIAL' | 'DUE' | 'UNBILLED' = 'UNBILLED';
      if (studentFees.length) {
        if (remaining <= 0.009) status = 'PAID';
        else if (paid > 0.009) status = 'PARTIAL';
        else status = 'DUE';
      }
      return {
        studentId: row.student.id,
        firstName: row.student.firstName,
        lastName: row.student.lastName,
        studentCode: row.student.studentCode,
        sectionId: row.section.id,
        sectionName: row.section.name,
        billed,
        paid,
        remaining,
        status,
      };
    });

    return {
      monthLabel: range.label,
      students: items.length,
      paidStudents: items.filter((item) => item.status === 'PAID').length,
      dueStudents: items.filter((item) => item.status === 'DUE').length,
      partialStudents: items.filter((item) => item.status === 'PARTIAL').length,
      unbilledStudents: items.filter((item) => item.status === 'UNBILLED').length,
      billedAmount: round2(items.reduce((sum, item) => sum + item.billed, 0)),
      receivedAmount: round2(items.reduce((sum, item) => sum + item.paid, 0)),
      remainingAmount: round2(items.reduce((sum, item) => sum + item.remaining, 0)),
      items,
    };
  }

  async listStudentFees(
    user: AuthUser,
    query: PaginationDto & {
      search?: string;
      status?: StudentFeeStatus;
      studentId?: string;
      sectionId?: string;
      dueThisMonth?: boolean;
      month?: string;
    },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    if (this.tenant.isParent(user)) {
      if (!query.studentId) {
        throw new ForbiddenException({
          code: 'STUDENT_ID_REQUIRED',
          message: 'studentId is required for parent fee list',
        });
      }
      await this.parentsService.assertParentOwnsStudent(user.id, query.studentId);
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const range = query.dueThisMonth ? monthRange(query.month) : null;
    const studentWhere = studentSearchWhere(query.search?.trim());
    const where: Prisma.StudentFeeWhereInput = {
      schoolId,
      ...(query.status
        ? { status: query.status }
        : query.dueThisMonth
          ? { status: { in: [StudentFeeStatus.DUE, StudentFeeStatus.PARTIAL] } }
          : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(range ? { dueDate: { gte: range.start, lt: range.end } } : {}),
      ...(studentWhere ? { student: studentWhere } : {}),
    };

    const [items, total] = await pageQuery(
      this.prisma.studentFee.findMany({
        where,
        orderBy: query.dueThisMonth
          ? [{ status: 'asc' }, { student: { firstName: 'asc' } }]
          : [{ dueDate: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          amount: true,
          paidAmount: true,
          discountAmount: true,
          dueDate: true,
          status: true,
          periodLabel: true,
          student: { select: { id: true, firstName: true, lastName: true, studentCode: true } },
          feeStructure: { select: { id: true, name: true } },
          section: { select: { id: true, name: true, grade: { select: { name: true } } } },
        },
      }),
      this.prisma.studentFee.count({ where }),
    );

    return {
      ...paginate(
        items.map((item) => ({
          ...item,
          amount: money(item.amount),
          paidAmount: money(item.paidAmount),
          discountAmount: money(item.discountAmount),
          balance: outstandingOf(item),
        })),
        total,
        page,
        limit,
      ),
      monthLabel: range?.label,
    };
  }

  async listCollections(
    user: AuthUser,
    query: PaginationDto & { search?: string; sectionId?: string; month?: string },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const range = monthRange(query.month);
    const search = query.search?.trim();
    const studentWhere = studentSearchWhere(search);
    const where: Prisma.FeePaymentWhereInput = {
      paidAt: { gte: range.start, lt: range.end },
      studentFee: {
        schoolId,
        ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      },
      ...(search
        ? {
            OR: [
              { receiptNumber: { contains: search } },
              { studentFee: { student: studentWhere } },
            ],
          }
        : {}),
    };

    const [items, total, sum] = await Promise.all([
      this.prisma.feePayment.findMany({
        where,
        orderBy: { paidAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          amount: true,
          discountAmount: true,
          receiptNumber: true,
          method: true,
          notes: true,
          paidAt: true,
          studentFee: {
            select: {
              id: true,
              periodLabel: true,
              status: true,
              student: { select: { id: true, firstName: true, lastName: true, studentCode: true } },
              feeStructure: { select: { id: true, name: true } },
              section: { select: { id: true, name: true, grade: { select: { name: true } } } },
            },
          },
        },
      }),
      this.prisma.feePayment.count({ where }),
      this.prisma.feePayment.aggregate({ where, _sum: { amount: true } }),
    ]);

    return {
      ...paginate(
        items.map((item) => ({
          ...item,
          amount: money(item.amount),
          discountAmount: money(item.discountAmount),
        })),
        total,
        page,
        limit,
      ),
      totalAmount: money(sum._sum.amount),
      monthLabel: range.label,
    };
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
    const discounted = money(fee.discountAmount);
    const amount = money(fee.amount);
    if (paid + discounted - amount > 0.009) {
      throw new BadRequestException({
        code: 'PAYMENT_EXCEEDS_DUE',
        message: 'Payment is more than the outstanding balance',
      });
    }

    let status: StudentFeeStatus = StudentFeeStatus.PARTIAL;
    if (paid <= 0 && discounted <= 0) status = StudentFeeStatus.DUE;
    if (Math.abs(paid + discounted - amount) < 0.01) {
      status = paid <= 0 ? StudentFeeStatus.WAIVED : StudentFeeStatus.PAID;
    }

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

  async markPaid(dto: MarkPaidDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const fee = await this.prisma.studentFee.findFirst({
      where: { id: dto.studentFeeId, schoolId },
    });
    if (!fee) {
      throw new NotFoundException({ code: 'STUDENT_FEE_NOT_FOUND', message: 'Fee record not found' });
    }

    const remaining = outstandingOf(fee);
    if (remaining <= 0) {
      if (fee.status !== StudentFeeStatus.PAID) {
        await this.prisma.studentFee.update({
          where: { id: fee.id },
          data: { status: StudentFeeStatus.PAID, paidAmount: fee.amount },
        });
      }
      return { studentFeeId: fee.id, status: StudentFeeStatus.PAID, amount: 0 };
    }

    return this.recordPayment(
      {
        studentFeeId: fee.id,
        amount: remaining,
        method: dto.method ?? 'CASH',
        notes: dto.notes ?? 'Marked paid by admin',
      },
      user,
    );
  }

  async lookup(user: AuthUser, q: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const term = q.trim();
    if (term.length < 2) return { items: [] };

    const students = await this.prisma.student.findMany({
      where: {
        schoolId,
        ...(studentSearchWhere(term) ?? {}),
      },
      take: 20,
      orderBy: { firstName: 'asc' },
      include: {
        enrollments: {
          where: { status: 'ACTIVE' },
          take: 1,
          include: { grade: true, section: true },
        },
        parents: { include: { parent: { include: { user: true } } } },
        fees: {
          where: { status: { in: ['DUE', 'PARTIAL'] } },
          select: { amount: true, paidAmount: true, discountAmount: true },
        },
      },
    });

    return {
      items: students.map((student) => {
        const enrollment = student.enrollments[0];
        const parents = student.parents.map(parentDisplay);
        return {
          id: student.id,
          name: `${student.firstName} ${student.lastName}`.trim(),
          studentCode: student.studentCode,
          admissionNumber: student.admissionNumber,
          className: enrollment?.grade.name ?? null,
          sectionName: enrollment?.section.name ?? null,
          tuitionFee: enrollment?.grade.tuitionFee != null ? money(enrollment.grade.tuitionFee) : null,
          parents,
          dueTotal: round2(student.fees.reduce((sum, fee) => sum + outstandingOf(fee), 0)),
        };
      }),
    };
  }

  async getAccount(studentId: string, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId },
      include: {
        enrollments: {
          where: { status: 'ACTIVE' },
          take: 1,
          include: { grade: true, section: true, academicYear: true },
        },
        parents: { include: { parent: { include: { user: true } } } },
      },
    });
    if (!student) {
      throw new NotFoundException({ code: 'STUDENT_NOT_FOUND', message: 'Student not found' });
    }

    const enrollment = student.enrollments[0];
    const year =
      enrollment?.academicYear ??
      (await this.prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } }));
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true, address: true, phone: true, code: true },
    });

    const fees = year
      ? await this.prisma.studentFee.findMany({
          where: { studentId: student.id, academicYearId: year.id },
          orderBy: { dueDate: 'asc' },
          include: { feeStructure: { select: { id: true, name: true, frequency: true } } },
        })
      : [];

    const periodLabel = currentPeriodLabel();
    const tuitionDefault = enrollment?.grade.tuitionFee != null ? money(enrollment.grade.tuitionFee) : 0;
    const admissionDefault = enrollment?.grade.admissionFee != null ? money(enrollment.grade.admissionFee) : 0;
    const tuitionStructure = enrollment
      ? await this.findTuitionStructure(schoolId, enrollment.grade)
      : null;
    const currentBill = fees.find(
      (fee) => fee.periodLabel === periodLabel && fee.feeStructure.frequency === 'MONTHLY',
    );

    return {
      school,
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        studentCode: student.studentCode,
        admissionNumber: student.admissionNumber,
      },
      className: enrollment?.grade.name ?? null,
      sectionName: enrollment?.section.name ?? null,
      academicYear: year ? { id: year.id, name: year.name } : null,
      parents: student.parents.map(parentDisplay),
      tuitionDefault,
      admissionDefault,
      suggested: {
        studentFeeId: currentBill?.id ?? null,
        feeStructureId: tuitionStructure?.id ?? null,
        periodLabel,
        amount: currentBill ? outstandingOf(currentBill) : tuitionDefault,
        billedAmount: currentBill ? money(currentBill.amount) : tuitionDefault,
        label: currentBill?.feeStructure.name ?? 'Monthly tuition',
      },
      fees: fees.map((fee) => ({
        id: fee.id,
        periodLabel: fee.periodLabel,
        name: fee.feeStructure.name,
        amount: money(fee.amount),
        paidAmount: money(fee.paidAmount),
        discountAmount: money(fee.discountAmount),
        balance: outstandingOf(fee),
        status: fee.status,
        dueDate: fee.dueDate,
      })),
    };
  }

  async collect(dto: CollectFeeDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const collected = round2(dto.collectedAmount);
    const discount = round2(dto.discountAmount ?? 0);
    if (collected <= 0 && discount <= 0) {
      throw new BadRequestException({
        code: 'AMOUNT_REQUIRED',
        message: 'Enter the amount collected, a discount, or both',
      });
    }

    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, schoolId },
      include: {
        enrollments: {
          where: { status: 'ACTIVE' },
          take: 1,
          include: { grade: true, section: true, academicYear: true },
        },
        parents: { include: { parent: { include: { user: true } } } },
      },
    });
    if (!student) {
      throw new NotFoundException({ code: 'STUDENT_NOT_FOUND', message: 'Student not found' });
    }

    const enrollment = student.enrollments[0];
    const year =
      enrollment?.academicYear ??
      (await this.prisma.academicYear.findFirst({ where: { schoolId, isCurrent: true } }));
    if (!year) {
      throw new BadRequestException({
        code: 'YEAR_REQUIRED',
        message: 'No academic year is set for this student',
      });
    }

    let fee = dto.studentFeeId
      ? await this.prisma.studentFee.findFirst({
          where: { id: dto.studentFeeId, schoolId, studentId: student.id },
          include: { feeStructure: true },
        })
      : null;

    if (!fee) {
      const periodLabel = dto.periodLabel?.trim() || currentPeriodLabel();
      let structure =
        (dto.feeStructureId
          ? await this.prisma.feeStructure.findFirst({ where: { id: dto.feeStructureId, schoolId } })
          : null) ??
        (enrollment ? await this.findTuitionStructure(schoolId, enrollment.grade) : null) ??
        (await this.prisma.feeStructure.findFirst({
          where: { schoolId, frequency: 'MONTHLY', active: true },
          orderBy: { createdAt: 'asc' },
        }));

      const billed =
        dto.billedAmount && dto.billedAmount > 0
          ? round2(dto.billedAmount)
          : enrollment?.grade.tuitionFee != null
            ? money(enrollment.grade.tuitionFee)
            : money(structure?.amount ?? 0);

      if (!structure && billed > 0 && enrollment) {
        const name = classFeeName(enrollment.grade.name, 'TUITION');
        structure = await this.prisma.feeStructure.upsert({
          where: { schoolId_name: { schoolId, name } },
          create: {
            schoolId,
            gradeId: enrollment.grade.id,
            kind: 'TUITION',
            name,
            amount: billed,
            frequency: 'MONTHLY',
            description: `Monthly tuition for ${enrollment.grade.name}`,
          },
          update: { amount: billed, gradeId: enrollment.grade.id, kind: 'TUITION', active: true },
        });
      }
      if (!structure) {
        throw new BadRequestException({
          code: 'FEE_TYPE_REQUIRED',
          message: 'Set monthly tuition for this class before collecting fees',
        });
      }
      fee = await this.prisma.studentFee.upsert({
        where: {
          studentId_feeStructureId_periodLabel: {
            studentId: student.id,
            feeStructureId: structure.id,
            periodLabel,
          },
        },
        create: {
          schoolId,
          branchId: student.branchId,
          studentId: student.id,
          feeStructureId: structure.id,
          academicYearId: year.id,
          sectionId: enrollment?.sectionId,
          periodLabel,
          amount: billed,
          dueDate: lastDayOfMonth(),
          status: StudentFeeStatus.DUE,
        },
        update: {},
        include: { feeStructure: true },
      });
    }

    if (!fee) {
      throw new BadRequestException({
        code: 'FEE_RECORD_REQUIRED',
        message: 'Could not find or create a fee bill for this student',
      });
    }

    const due = outstandingOf(fee);
    const applied = round2(collected + discount);
    if (applied - due > 0.009) {
      throw new BadRequestException({
        code: 'PAYMENT_EXCEEDS_DUE',
        message: `Collected plus discount cannot exceed the due amount of ${due}`,
      });
    }

    const paid = round2(money(fee.paidAmount) + collected);
    const discounted = round2(money(fee.discountAmount) + discount);
    const billed = money(fee.amount);
    const remaining = round2(Math.max(0, billed - paid - discounted));
    let status: StudentFeeStatus = StudentFeeStatus.PARTIAL;
    if (remaining <= 0.009) {
      status = collected <= 0 ? StudentFeeStatus.WAIVED : StudentFeeStatus.PAID;
    } else if (paid <= 0 && discounted <= 0) {
      status = StudentFeeStatus.DUE;
    }

    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true, address: true, phone: true, code: true },
    });
    const receiptNumber = await this.nextReceiptNumber(schoolId, school?.code ?? 'SCH');

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.feePayment.create({
        data: {
          studentFeeId: fee.id,
          amount: collected,
          discountAmount: discount,
          receiptNumber,
          method: dto.method ?? 'CASH',
          notes: dto.notes,
          recordedById: user.id,
        },
        include: {
          recordedBy: { select: { firstName: true, lastName: true } },
        },
      });
      await tx.studentFee.update({
        where: { id: fee.id },
        data: { paidAmount: paid, discountAmount: discounted, status },
      });
      return created;
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'FEE_COLLECTED',
      entityType: 'FeePayment',
      entityId: payment.id,
      metadata: { receiptNumber, collected, discount, remaining },
    });

    return this.toReceipt({
      payment: { ...payment, amount: collected, discountAmount: discount, receiptNumber },
      fee: { ...fee, amount: billed, paidAmount: paid, discountAmount: discounted, status },
      student,
      enrollment,
      school,
      remaining,
      recordedBy: payment.recordedBy,
    });
  }

  async getReceipt(paymentId: string, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const payment = await this.prisma.feePayment.findFirst({
      where: { id: paymentId, studentFee: { schoolId } },
      include: {
        recordedBy: { select: { firstName: true, lastName: true } },
        studentFee: {
          include: {
            feeStructure: true,
            student: {
              include: {
                enrollments: {
                  where: { status: 'ACTIVE' },
                  take: 1,
                  include: { grade: true, section: true },
                },
                parents: { include: { parent: { include: { user: true } } } },
              },
            },
            school: { select: { name: true, address: true, phone: true, code: true } },
          },
        },
      },
    });
    if (!payment) {
      throw new NotFoundException({ code: 'RECEIPT_NOT_FOUND', message: 'Receipt not found' });
    }
    const fee = payment.studentFee;
    return this.toReceipt({
      payment,
      fee,
      student: fee.student,
      enrollment: fee.student.enrollments[0],
      school: fee.school,
      remaining: outstandingOf(fee),
      recordedBy: payment.recordedBy,
    });
  }

  private toReceipt(input: {
    payment: {
      id: string;
      amount: unknown;
      discountAmount?: unknown;
      receiptNumber?: string | null;
      method?: string | null;
      notes?: string | null;
      paidAt?: Date;
    };
    fee: {
      id: string;
      periodLabel: string;
      amount: unknown;
      paidAmount: unknown;
      discountAmount?: unknown;
      status: string;
      feeStructure?: { name?: string } | null;
    };
    student: {
      id: string;
      firstName: string;
      lastName: string;
      studentCode: string;
      admissionNumber: string;
      parents: Array<{
        relationship?: string | null;
        parent?: {
          phone?: string | null;
          user?: { firstName?: string | null; lastName?: string | null; phone?: string | null } | null;
        } | null;
      }>;
    };
    enrollment?: {
      grade?: { name?: string } | null;
      section?: { name?: string } | null;
    } | null;
    school: { name: string; address?: string | null; phone?: string | null; code?: string } | null;
    remaining: number;
    recordedBy: { firstName: string; lastName: string };
  }) {
    const collected = money(input.payment.amount);
    const discount = money(input.payment.discountAmount);
    const parents = input.student.parents.map(parentDisplay);
    return {
      id: input.payment.id,
      receiptNumber: input.payment.receiptNumber,
      paidAt: input.payment.paidAt,
      method: input.payment.method ?? 'CASH',
      notes: input.payment.notes ?? null,
      school: input.school,
      student: {
        id: input.student.id,
        name: `${input.student.firstName} ${input.student.lastName}`.trim(),
        studentCode: input.student.studentCode,
        admissionNumber: input.student.admissionNumber,
        className: input.enrollment?.grade?.name ?? null,
        sectionName: input.enrollment?.section?.name ?? null,
      },
      parents,
      fee: {
        id: input.fee.id,
        name: input.fee.feeStructure?.name ?? 'Fee',
        periodLabel: input.fee.periodLabel,
        billed: money(input.fee.amount),
        paidToDate: money(input.fee.paidAmount),
        discountedToDate: money(input.fee.discountAmount),
        status: input.fee.status,
      },
      collected,
      discount,
      balance: input.remaining,
      receivedBy: `${input.recordedBy.firstName} ${input.recordedBy.lastName}`.trim(),
    };
  }

  private async nextReceiptNumber(schoolId: string, schoolCode: string) {
    const stamp = new Date();
    const prefix = `${schoolCode}-${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}-`;
    const last = await this.prisma.feePayment.findFirst({
      where: { receiptNumber: { startsWith: prefix }, studentFee: { schoolId } },
      orderBy: { receiptNumber: 'desc' },
    });
    const next = last?.receiptNumber ? Number(last.receiptNumber.slice(prefix.length)) + 1 : 1;
    const serial = Number.isFinite(next) && next > 0 ? next : 1;
    return `${prefix}${String(serial).padStart(4, '0')}`;
  }
}
