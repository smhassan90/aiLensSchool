import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, paginate } from '../common/dto/pagination.dto';
import { CreateEventDto, UpdateEventDto } from './dto/event.dto';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
  ) {}

  async create(dto: CreateEventDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const event = await this.prisma.event.create({
      data: {
        schoolId,
        createdById: user.id,
        title: dto.title,
        description: dto.description,
        type: dto.type,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        location: dto.location,
        audience: dto.audience,
        branchId: dto.branchId,
        gradeId: dto.gradeId,
        sectionId: dto.sectionId,
      },
    });
    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'EVENT_CREATED',
      entityType: 'Event',
      entityId: event.id,
    });
    return event;
  }

  async update(id: string, dto: UpdateEventDto, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.event.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        type: dto.type,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        location: dto.location,
      },
    });
  }

  async findAll(user: AuthUser, query: PaginationDto) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.EventWhereInput = { schoolId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        orderBy: { startDate: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.event.count({ where }),
    ]);
    return paginate(items, total, page, limit);
  }

  async findOne(id: string, user: AuthUser) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'Event not found' });
    }
    this.tenant.assertSchoolAccess(user, event.schoolId);
    return event;
  }

  async remove(id: string, user: AuthUser) {
    await this.findOne(id, user);
    await this.prisma.event.delete({ where: { id } });
    return { deleted: true, id };
  }
}
