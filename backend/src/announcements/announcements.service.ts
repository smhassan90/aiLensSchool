import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AnnouncementAudience, AnnouncementStatus, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { NotificationService } from '../notifications/notifications.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/announcement.dto';

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
    private readonly notifications: NotificationService,
  ) {}

  async create(dto: CreateAnnouncementDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    // Allow targeting several class sections at once: create one announcement
    // per selected section so each can be tracked/published independently,
    // while still returning a single logical result to the caller.
    const sectionIds = dto.sectionIds && dto.sectionIds.length ? [...new Set(dto.sectionIds)] : dto.sectionId ? [dto.sectionId] : [null];

    const announcements = await this.prisma.$transaction(
      sectionIds.map((sectionId) =>
        this.prisma.announcement.create({
          data: {
            schoolId,
            createdById: user.id,
            title: dto.title,
            description: dto.description,
            audience: dto.audience,
            branchId: dto.branchId,
            gradeId: dto.gradeId,
            sectionId: sectionId ?? undefined,
            publishAt: dto.publishAt ? new Date(dto.publishAt) : null,
            expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
            status: AnnouncementStatus.DRAFT,
          },
        }),
      ),
    );

    for (const announcement of announcements) {
      await this.audit.log({
        actorUserId: user.id,
        schoolId,
        action: 'ANNOUNCEMENT_CREATED',
        entityType: 'Announcement',
        entityId: announcement.id,
      });
    }
    return announcements.length === 1 ? announcements[0] : announcements;
  }

  async publish(id: string, user: AuthUser) {
    const existing = await this.findOne(id, user);
    if (existing.audience === AnnouncementAudience.SECTION && !existing.sectionId) {
      throw new BadRequestException({ code: 'SECTION_REQUIRED', message: 'Select a class section first' });
    }
    if (existing.audience === AnnouncementAudience.GRADE && !existing.gradeId) {
      throw new BadRequestException({ code: 'GRADE_REQUIRED', message: 'Select a grade first' });
    }
    if (existing.audience === AnnouncementAudience.BRANCH && !existing.branchId) {
      throw new BadRequestException({ code: 'BRANCH_REQUIRED', message: 'Select a branch first' });
    }
    const announcement = await this.prisma.announcement.update({
      where: { id: existing.id },
      data: {
        status: AnnouncementStatus.PUBLISHED,
        publishAt: existing.publishAt ?? new Date(),
      },
    });

    const parents = await this.prisma.studentParent.findMany({
      where: {
        student: {
          schoolId: announcement.schoolId,
          ...(announcement.branchId ? { branchId: announcement.branchId } : {}),
          enrollments: {
            some: {
              status: 'ACTIVE',
              ...(announcement.sectionId ? { sectionId: announcement.sectionId } : {}),
              ...(announcement.gradeId ? { gradeId: announcement.gradeId } : {}),
            },
          },
        },
      },
      select: { parent: { select: { userId: true } } },
    });
    await this.notifications.createForUsers(
      [...new Set(parents.map((item) => item.parent.userId))],
      {
        schoolId: announcement.schoolId,
        type: NotificationType.ANNOUNCEMENT,
        title: announcement.title,
        body: announcement.description,
        data: { announcementId: announcement.id } as Prisma.InputJsonValue,
        deepLink: `/announcement/${announcement.id}`,
      },
    );

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
