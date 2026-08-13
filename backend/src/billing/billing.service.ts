import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, Prisma, StudentStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, paginate } from '../common/dto/pagination.dto';
import {
  CreatePricingPlanDto,
  GenerateInvoiceDto,
  UpdatePricingPlanDto,
} from './dto/billing.dto';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Fee rule: MAX(activeStudents * pricePerStudent, minimumMonthlyFee)
   */
  calculateBranchFee(
    activeStudents: number,
    pricePerStudent: number,
    minimumMonthlyFee: number,
  ): number {
    return Math.max(activeStudents * pricePerStudent, minimumMonthlyFee);
  }

  async createPlan(dto: CreatePricingPlanDto, user: AuthUser) {
    const plan = await this.prisma.pricingPlan.create({
      data: {
        name: dto.name,
        pricePerStudent: dto.pricePerStudent,
        minimumMonthlyFee: dto.minimumMonthlyFee,
        currency: dto.currency ?? 'PKR',
        description: dto.description,
        active: dto.active ?? true,
      },
    });
    await this.audit.log({
      actorUserId: user.id,
      action: 'PRICING_PLAN_CREATED',
      entityType: 'PricingPlan',
      entityId: plan.id,
    });
    return plan;
  }

  async updatePlan(id: string, dto: UpdatePricingPlanDto, user: AuthUser) {
    const plan = await this.prisma.pricingPlan.update({
      where: { id },
      data: {
        name: dto.name,
        pricePerStudent: dto.pricePerStudent,
        minimumMonthlyFee: dto.minimumMonthlyFee,
        active: dto.active,
        description: dto.description,
      },
    });
    await this.audit.log({
      actorUserId: user.id,
      action: 'PRICING_PLAN_UPDATED',
      entityType: 'PricingPlan',
      entityId: id,
    });
    return plan;
  }

  async listPlans(query: PaginationDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.pricingPlan.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.pricingPlan.count(),
    ]);
    return paginate(items, total, page, limit);
  }

  async preview(schoolId: string) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      include: { pricingPlan: true, branches: true },
    });
    if (!school) {
      throw new NotFoundException({ code: 'SCHOOL_NOT_FOUND', message: 'School not found' });
    }
    if (!school.pricingPlan) {
      throw new BadRequestException({
        code: 'NO_PRICING_PLAN',
        message: 'School has no pricing plan assigned',
      });
    }

    const rate = Number(school.pricingPlan.pricePerStudent);
    const minimum = Number(school.pricingPlan.minimumMonthlyFee);

    const branchBreakdown = await Promise.all(
      school.branches.map(async (branch) => {
        const activeStudents = await this.prisma.student.count({
          where: { branchId: branch.id, status: StudentStatus.ACTIVE },
        });
        const fee = this.calculateBranchFee(activeStudents, rate, minimum);
        return {
          branchId: branch.id,
          branchName: branch.name,
          activeStudents,
          rate,
          minimumFee: minimum,
          calculatedFee: fee,
        };
      }),
    );

    const total = branchBreakdown.reduce((sum, b) => sum + b.calculatedFee, 0);
    return {
      schoolId,
      schoolName: school.name,
      currency: school.pricingPlan.currency,
      pricingPlan: school.pricingPlan,
      branches: branchBreakdown,
      total,
    };
  }

  async generateInvoice(dto: GenerateInvoiceDto, user: AuthUser) {
    const preview = await this.preview(dto.schoolId);
    const invoiceNumber = `INV-${dto.billingPeriod.replace('-', '')}-${dto.schoolId.slice(0, 8).toUpperCase()}`;

    const existing = await this.prisma.invoice.findFirst({
      where: { schoolId: dto.schoolId, billingPeriod: dto.billingPeriod },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'INVOICE_EXISTS',
        message: 'Invoice already exists for this billing period',
      });
    }

    const invoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          schoolId: dto.schoolId,
          invoiceNumber,
          billingPeriod: dto.billingPeriod,
          periodStart: new Date(dto.periodStart),
          periodEnd: new Date(dto.periodEnd),
          subtotal: preview.total,
          total: preview.total,
          currency: preview.currency,
          status: InvoiceStatus.ISSUED,
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          issuedAt: new Date(),
          items: {
            create: preview.branches.map((b) => ({
              branchId: b.branchId,
              description: `Branch fee: ${b.branchName} (${dto.billingPeriod})`,
              activeStudents: b.activeStudents,
              rate: b.rate,
              minimumFee: b.minimumFee,
              subtotal: b.calculatedFee,
            })),
          },
        },
        include: { items: true },
      });

      for (const b of preview.branches) {
        await tx.billingRecord.create({
          data: {
            schoolId: dto.schoolId,
            branchId: b.branchId,
            billingPeriod: dto.billingPeriod,
            activeStudents: b.activeStudents,
            rate: b.rate,
            minimumFee: b.minimumFee,
            calculatedFee: b.calculatedFee,
          },
        });
      }

      return created;
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId: dto.schoolId,
      action: 'INVOICE_GENERATED',
      entityType: 'Invoice',
      entityId: invoice.id,
    });

    return invoice;
  }

  async listInvoices(query: PaginationDto & { schoolId?: string }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.InvoiceWhereInput = {
      ...(query.schoolId ? { schoolId: query.schoolId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { items: true, school: { select: { id: true, name: true, code: true } } },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return paginate(items, total, page, limit);
  }
}
