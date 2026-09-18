import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationType, Prisma } from '@prisma/client';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
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
  private readonly logger = new Logger(NotificationService.name);
  private readonly messaging: Messaging | null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const serviceAccountJson = config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!serviceAccountJson) {
      this.messaging = null;
      this.logger.warn('FCM is disabled: FIREBASE_SERVICE_ACCOUNT_JSON is not configured');
      return;
    }

    try {
      const serviceAccount = JSON.parse(serviceAccountJson) as {
        project_id: string;
        client_email: string;
        private_key: string;
      };
      const app =
        getApps()[0] ??
        initializeApp({
          credential: cert({
            projectId: serviceAccount.project_id,
            clientEmail: serviceAccount.client_email,
            privateKey: serviceAccount.private_key.replace(/\\n/g, '\n'),
          }),
        });
      this.messaging = getMessaging(app);
    } catch (error) {
      this.messaging = null;
      this.logger.error(
        `FCM is disabled: invalid FIREBASE_SERVICE_ACCOUNT_JSON (${error instanceof Error ? error.message : 'unknown error'})`,
      );
    }
  }

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

  async createForUsers(
    userIds: string[],
    input: Omit<CreateNotificationInput, 'userId'>,
  ) {
    const uniqueUserIds = [...new Set(userIds)];
    if (!uniqueUserIds.length) return { created: 0, delivered: 0 };

    const now = new Date();
    await this.prisma.notification.createMany({
      data: uniqueUserIds.map((userId) => ({
        schoolId: input.schoolId ?? undefined,
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data,
        deepLink: input.deepLink,
        sentAt: now,
      })),
    });

    const delivered = await this.sendPush(uniqueUserIds, input);
    return { created: uniqueUserIds.length, delivered };
  }

  private async sendPush(
    userIds: string[],
    input: Omit<CreateNotificationInput, 'userId' | 'schoolId'> & {
      schoolId?: string | null;
    },
  ) {
    if (!this.messaging) return 0;

    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId: { in: userIds }, active: true },
      select: { id: true, userId: true, token: true },
    });
    if (!tokens.length) return 0;

    const disabledPreferences = await this.prisma.notificationPreference.findMany({
      where: {
        userId: { in: userIds },
        type: input.type,
        pushEnabled: false,
      },
      select: { userId: true },
    });
    const disabledUserIds = new Set(disabledPreferences.map((item) => item.userId));
    const enabledTokens = tokens.filter((device) => !disabledUserIds.has(device.userId));
    if (!enabledTokens.length) return 0;

    const message = {
      tokens: enabledTokens.map((device) => device.token),
      notification: { title: input.title, body: input.body },
      data: {
        type: input.type,
        ...(input.deepLink ? { deepLink: input.deepLink } : {}),
        ...(input.data && typeof input.data === 'object'
          ? Object.fromEntries(
              Object.entries(input.data).map(([key, value]) => [key, String(value)]),
            )
          : {}),
      },
    };

    try {
      const response = await this.messaging.sendEachForMulticast(message);
      const invalidTokenIds = response.responses
        .map((result, index) => (result.success ? null : enabledTokens[index]?.id))
        .filter((id): id is string => Boolean(id));
      if (invalidTokenIds.length) {
        await this.prisma.deviceToken.updateMany({
          where: { id: { in: invalidTokenIds } },
          data: { active: false },
        });
      }
      return response.successCount;
    } catch (error) {
      this.logger.error(
        `FCM delivery failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return 0;
    }
  }
}
