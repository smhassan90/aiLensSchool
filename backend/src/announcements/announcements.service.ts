import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AnnouncementStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/announcement.dto';

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
  ) {}

  async create(dto: CreateAnnouncementDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const announcement = await this.prisma.announcement.create({
      data: {
        schoolId,
        createdById: user.id,
        title: dto.title,
        description: dto.description,
        audience: dto.audience,
        branchId: dto.branchId,
        gradeId: dto.gradeId,
        sectionId: dto.sectionId,
        publishAt: dto.publishAt ? new Date(dto.publishAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        status: AnnouncementStatus.DRAFT,
      },
    });
    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'ANNOUNCEMENT_CREATED',
      entityType: 'Announcement',
      entityId: announcement.id,
    });
    return announcement;
  }

  async publish(id: string, user: AuthUser) {
    const existing = await this.findOne(id, user);
    const announcement = await this.prisma.announcement.update({
      where: { id: existing.id },
      data: {
        status: AnnouncementStatus.PUBLISHED,
        publishAt: existing.publishAt ?? new Date(),
      },
    });
    await this.audit.log({
      actorUserId: user.id,
      schoolId: announcement.schoolId,
      action: 'ANNOUNCEMENT_PUBLISHED',
      entityType: 'Announcement',
      entityId: id,
    });
    return announcement;
  }

  async update(id: string, dto: UpdateAnnouncementDto, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.announcement.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        audience: dto.audience,
        status: dto.status,
      },
    });
  }

  async findAll(user: AuthUser, query: PaginationDto & { status?: AnnouncementStatus }) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.AnnouncementWhereInput = {
      schoolId,
      ...(this.tenant.isParent(user)
        ? { status: AnnouncementStatus.PUBLISHED }
        : query.status
          ? { status: query.status }
          : {}),
    };
    const [items, total] = await pageQuery(
      this.prisma.announcement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.announcement.count({ where }),
    );
    return paginate(items, total, page, limit);
  }

  async findOne(id: string, user: AuthUser) {
    const announcement = await this.prisma.announcement.findUnique({ where: { id } });
    if (!announcement) {
      throw new NotFoundException({
        code: 'ANNOUNCEMENT_NOT_FOUND',
        message: 'Announcement not found',
      });
    }
    this.tenant.assertSchoolAccess(user, announcement.schoolId);
    if (this.tenant.isParent(user) && announcement.status !== AnnouncementStatus.PUBLISHED) {
      throw new ForbiddenException({
        code: 'ANNOUNCEMENT_NOT_AVAILABLE',
        message: 'Announcement is not available',
      });
    }
    return announcement;
  }
}
