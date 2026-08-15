import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';

export interface CreateNotificationInput {
  schoolId?: string | null;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
  deepLink?: string;
}

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist notification and mark as queued/sent.
   * When a push worker exists, this is the enqueue entry point.
   */
  async createAndQueue(input: CreateNotificationInput) {
    return this.prisma.notification.create({
      data: {
        schoolId: input.schoolId ?? undefined,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data,
        deepLink: input.deepLink,
        sentAt: new Date(),
      },
    });
  }

  async listForUser(user: AuthUser, query: PaginationDto & { unreadOnly?: boolean }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.NotificationWhereInput = {
      userId: user.id,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };
    const [items, total] = await pageQuery(
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    );
    return paginate(items, total, page, limit);
  }

  async markRead(id: string, user: AuthUser) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId: user.id },
    });
    if (!notification) {
      return { id, read: false };
    }
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async registerDevice(
    user: AuthUser,
    input: { token: string; platform?: string; deviceName?: string },
  ) {
    return this.prisma.deviceToken.upsert({
      where: {
        userId_token: { userId: user.id, token: input.token },
      },
      create: {
        userId: user.id,
        token: input.token,
        platform: input.platform,
        deviceName: input.deviceName,
        active: true,
      },
      update: {
        platform: input.platform,
        deviceName: input.deviceName,
        active: true,
      },
    });
  }
}
