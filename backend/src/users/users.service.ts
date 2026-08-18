import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma, RoleName, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { parsePermissions, PRINCIPAL_DEFAULT_PERMISSIONS, StaffPermission } from '../common/permissions';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly audit: AuditService,
  ) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: { include: { role: true } },
        school: { select: { id: true, name: true, code: true } },
        teacherProfile: true,
        parentProfile: true,
      },
    });
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }
    const { passwordHash: _passwordHash, ...safe } = user;
    return {
      ...safe,
      roles: user.roles.map((r) => r.role.name),
    };
  }

  async findAll(query: PaginationDto & { search?: string; schoolId?: string; status?: UserStatus }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.UserWhereInput = {
      ...(query.schoolId ? { schoolId: query.schoolId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search } },
              { firstName: { contains: query.search } },
              { lastName: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await pageQuery(
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          status: true,
          schoolId: true,
          lastLoginAt: true,
          createdAt: true,
          permissions: true,
          roles: { include: { role: true } },
          school: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.user.count({ where }),
    );

    return paginate(
      items.map((u) => ({
        ...u,
        roles: u.roles.map((r) => r.role.name),
        permissions: parsePermissions(u.permissions),
      })),
      total,
      page,
      limit,
    );
  }

  async listStaff(user: AuthUser, query: PaginationDto) {
    const schoolId = this.tenant.requireSchoolId(user);
    return this.findAll({ ...query, schoolId });
  }

  async createStaff(
    user: AuthUser,
    dto: {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      phone?: string;
      title?: string;
      permissions?: StaffPermission[];
    },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException({ code: 'EMAIL_EXISTS', message: 'Email already registered' });
    }
    const role = await this.prisma.role.findUnique({ where: { name: RoleName.PRINCIPAL } });
    if (!role) {
      throw new BadRequestException({
        code: 'ROLE_MISSING',
        message: 'PRINCIPAL role missing. Restart after schema update / seed.',
      });
    }
    const permissions = parsePermissions(dto.permissions?.length ? dto.permissions : PRINCIPAL_DEFAULT_PERMISSIONS);
    const created = await this.prisma.$transaction(async (tx) => {
      const staff = await tx.user.create({
        data: {
          email,
          username: email.split('@')[0],
          passwordHash: await bcrypt.hash(dto.password, 12),
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          schoolId,
          status: UserStatus.ACTIVE,
          permissions,
        },
      });
      await tx.userRole.create({ data: { userId: staff.id, roleId: role.id, schoolId } });
      return staff;
    });
    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'STAFF_CREATED',
      entityType: 'User',
      entityId: created.id,
      metadata: { title: dto.title ?? 'Principal', permissions },
    });
    const { passwordHash: _pw, ...safe } = created;
    return { ...safe, roles: [RoleName.PRINCIPAL], permissions };
  }
}
