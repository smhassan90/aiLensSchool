import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';

interface AuditInput {
  actorUserId?: string | null;
  schoolId?: string | null;
  branchId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(input: AuditInput) {
    void this.prisma.auditLog
      .create({
        data: {
          actorUserId: input.actorUserId ?? undefined,
          schoolId: input.schoolId ?? undefined,
          branchId: input.branchId ?? undefined,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? undefined,
          metadata: input.metadata,
          ipAddress: input.ipAddress ?? undefined,
        },
      })
      .catch(() => undefined);
  }

  async findAll(
    query: PaginationDto & { schoolId?: string; action?: string; from?: string; to?: string },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const createdAt: Prisma.DateTimeFilter | undefined =
      query.from || query.to
        ? {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to
              ? {
                  lte: (() => {
                    const d = new Date(query.to);
                    d.setHours(23, 59, 59, 999);
                    return d;
                  })(),
                }
              : {}),
          }
        : undefined;
    const where: Prisma.AuditLogWhereInput = {
      ...(query.schoolId ? { schoolId: query.schoolId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(createdAt ? { createdAt } : {}),
    };
    const [items, total] = await pageQuery(
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          actor: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    );
    return paginate(items, total, page, limit);
  }
}
