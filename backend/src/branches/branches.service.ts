import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BranchStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import { CreateBranchDto, UpdateBranchDto } from './dto/create-branch.dto';

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
  ) {}

  async create(dto: CreateBranchDto, user: AuthUser) {
    const schoolId = this.tenant.isSuperAdmin(user)
      ? dto.schoolId ?? this.tenant.requireSchoolId(user)
      : this.tenant.requireSchoolId(user);

    this.tenant.assertSchoolAccess(user, schoolId);

    const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) {
      throw new NotFoundException({ code: 'SCHOOL_NOT_FOUND', message: 'School not found' });
    }

    const code = dto.code.toUpperCase();
    const existing = await this.prisma.branch.findUnique({
      where: { schoolId_code: { schoolId, code } },
    });
    if (existing) {
      throw new ConflictException({
        code: 'BRANCH_CODE_EXISTS',
        message: 'Branch code already exists for this school',
      });
    }

    const branch = await this.prisma.branch.create({
      data: {
        schoolId,
        name: dto.name,
        code,
        address: dto.address,
        phone: dto.phone,
        status: BranchStatus.ACTIVE,
      },
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      branchId: branch.id,
      action: 'BRANCH_CREATED',
      entityType: 'Branch',
      entityId: branch.id,
    });

    return branch;
  }

  async findAll(
    user: AuthUser,
    query: PaginationDto & { search?: string; status?: BranchStatus; schoolId?: string },
  ) {
    const schoolId = this.tenant.isSuperAdmin(user)
      ? query.schoolId
      : this.tenant.requireSchoolId(user);

    if (schoolId) {
      this.tenant.assertSchoolAccess(user, schoolId);
    } else if (!this.tenant.isSuperAdmin(user)) {
      this.tenant.requireSchoolId(user);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.BranchWhereInput = {
      ...(schoolId ? { schoolId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search } },
              { code: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await pageQuery(
      (skip, take) =>
        this.prisma.branch.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          include: {
            school: { select: { id: true, name: true, code: true } },
            _count: { select: { students: true, teachers: true, sections: true } },
          },
        }),
      () => this.prisma.branch.count({ where }),
      page,
      limit,
    );

    return paginate(items, total, page, limit);
  }

  async findOne(id: string, user: AuthUser) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: {
        school: { select: { id: true, name: true, code: true } },
        _count: { select: { students: true, teachers: true, sections: true } },
      },
    });
    return this.tenant.assertOwnedOrThrow(user, branch, 'BRANCH_NOT_FOUND');
  }

  async update(id: string, dto: UpdateBranchDto, user: AuthUser) {
    await this.findOne(id, user);
    const branch = await this.prisma.branch.update({
      where: { id },
      data: {
        name: dto.name,
        address: dto.address,
        phone: dto.phone,
        status: dto.status,
      },
    });
    await this.audit.log({
      actorUserId: user.id,
      schoolId: branch.schoolId,
      branchId: branch.id,
      action: 'BRANCH_UPDATED',
      entityType: 'Branch',
      entityId: branch.id,
    });
    return branch;
  }
}
