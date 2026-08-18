import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  Prisma,
  RoleName,
  SchoolStatus,
  SubscriptionStatus,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';

@Injectable()
export class SchoolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
  ) {}

  async createSchoolWithAdmin(dto: CreateSchoolDto, actor: AuthUser) {
    const existing = await this.prisma.school.findUnique({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException({
        code: 'SCHOOL_CODE_EXISTS',
        message: 'School code already exists',
      });
    }

    const adminEmail = dto.admin.email.toLowerCase();
    const existingUser = await this.prisma.user.findUnique({ where: { email: adminEmail } });
    if (existingUser) {
      throw new ConflictException({
        code: 'ADMIN_EMAIL_EXISTS',
        message: 'Admin email already exists',
      });
    }

    const defaultPlan = await this.prisma.pricingPlan.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!defaultPlan) {
      throw new BadRequestException({
        code: 'NO_PRICING_PLAN',
        message: 'No active pricing plan configured. Seed the database first.',
      });
    }

    const passwordHash = await bcrypt.hash(dto.admin.password, 12);
    const schoolAdminRole = await this.prisma.role.findUnique({
      where: { name: RoleName.SCHOOL_ADMIN },
    });
    if (!schoolAdminRole) {
      throw new BadRequestException({
        code: 'ROLE_MISSING',
        message: 'SCHOOL_ADMIN role not found. Seed roles first.',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: {
          name: dto.name,
          code: dto.code.toUpperCase(),
          email: dto.email.toLowerCase(),
          phone: dto.phone,
          address: dto.address,
          city: dto.city,
          country: dto.country,
          status: SchoolStatus.ACTIVE,
          pricingPlanId: defaultPlan.id,
        },
      });

      const branch = dto.branch
        ? await tx.branch.create({
            data: {
              schoolId: school.id,
              name: dto.branch.name,
              code: dto.branch.code.toUpperCase(),
              address: dto.branch.address,
              phone: dto.branch.phone,
            },
          })
        : null;

      await tx.schoolSettings.create({
        data: { schoolId: school.id },
      });

      await tx.schoolSubscription.create({
        data: {
          schoolId: school.id,
          pricingPlanId: defaultPlan.id,
          status: SubscriptionStatus.TRIAL,
          startsAt: new Date(),
          trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const admin = await tx.user.create({
        data: {
          email: adminEmail,
          username: adminEmail.split('@')[0],
          passwordHash,
          firstName: dto.admin.firstName,
          lastName: dto.admin.lastName,
          phone: dto.admin.phone,
          schoolId: school.id,
          status: UserStatus.ACTIVE,
        },
      });

      await tx.userRole.create({
        data: {
          userId: admin.id,
          roleId: schoolAdminRole.id,
          schoolId: school.id,
        },
      });

      return { school, branch, admin: { id: admin.id, email: admin.email } };
    });

    await this.audit.log({
      actorUserId: actor.id,
      schoolId: result.school.id,
      action: 'SCHOOL_CREATED',
      entityType: 'School',
      entityId: result.school.id,
      metadata: { code: result.school.code },
    });

    return result;
  }

  async findAll(query: PaginationDto & { search?: string; status?: SchoolStatus }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.SchoolWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search } },
              { code: { contains: query.search } },
              { email: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await pageQuery(
      this.prisma.school.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { branches: true, students: true, teachers: true, parents: true } },
          subscription: true,
        },
      }),
      this.prisma.school.count({ where }),
    );

    return paginate(items, total, page, limit);
  }

  async findOne(id: string, user: AuthUser) {
    const school = await this.prisma.school.findUnique({
      where: { id },
      include: {
        branches: true,
        settings: true,
        subscription: { include: { pricingPlan: true } },
        _count: { select: { students: true, teachers: true, parents: true } },
      },
    });
    if (!school) {
      throw new NotFoundException({ code: 'SCHOOL_NOT_FOUND', message: 'School not found' });
    }
    this.tenant.assertSchoolAccess(user, school.id);
    return school;
  }

  async update(id: string, dto: UpdateSchoolDto, user: AuthUser) {
    await this.findOne(id, user);
    const school = await this.prisma.school.update({
      where: { id },
      data: {
        name: dto.name,
        email: dto.email?.toLowerCase(),
        phone: dto.phone,
        address: dto.address,
        city: dto.city,
        country: dto.country,
        logo: dto.logo,
        status: dto.status,
      },
    });
    await this.audit.log({
      actorUserId: user.id,
      schoolId: id,
      action: 'SCHOOL_UPDATED',
      entityType: 'School',
      entityId: id,
    });
    return school;
  }

  async setStatus(id: string, status: SchoolStatus, user: AuthUser) {
    const school = await this.prisma.school.update({
      where: { id },
      data: { status },
    });
    await this.audit.log({
      actorUserId: user.id,
      schoolId: id,
      action: status === SchoolStatus.SUSPENDED ? 'SCHOOL_SUSPENDED' : 'SCHOOL_STATUS_CHANGED',
      entityType: 'School',
      entityId: id,
      metadata: { status },
    });
    return school;
  }

  async dashboardStats() {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [
      totalSchools,
      activeSchools,
      inactiveSchools,
      totalBranches,
      totalStudents,
      totalTeachers,
      totalParents,
      overdueInvoices,
      aiAgg,
      notificationCount,
      monthlyRevenue,
    ] = await Promise.all([
      this.prisma.school.count(),
      this.prisma.school.count({ where: { status: SchoolStatus.ACTIVE } }),
      this.prisma.school.count({
        where: { status: { in: [SchoolStatus.INACTIVE, SchoolStatus.SUSPENDED] } },
      }),
      this.prisma.branch.count(),
      this.prisma.student.count({ where: { status: 'ACTIVE' } }),
      this.prisma.teacherProfile.count({ where: { status: 'ACTIVE' } }),
      this.prisma.parentProfile.count(),
      this.prisma.invoice.count({ where: { status: 'OVERDUE' } }),
      this.prisma.aIRequest.aggregate({
        _count: true,
        _sum: { estimatedCost: true },
      }),
      this.prisma.notification.count({ where: { sentAt: { not: null } } }),
      this.prisma.payment.aggregate({
        where: { status: 'COMPLETED', paidAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
    ]);

    return {
      totalSchools,
      activeSchools,
      inactiveSchools,
      totalBranches,
      totalStudents,
      totalTeachers,
      totalParents,
      monthlyRevenue: monthlyRevenue._sum.amount ?? 0,
      overdueInvoices,
      aiRequests: aiAgg._count,
      aiEstimatedCost: aiAgg._sum.estimatedCost ?? 0,
      notificationsSent: notificationCount,
    };
  }
}
