import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export type SchoolSyncContext = {
  schoolId: string;
  schoolName: string;
  syncApiKey: string;
};

@Injectable()
export class SchoolSyncKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      params?: { deviceId?: string; id?: string };
      body?: { apiKey?: string };
      headers?: Record<string, string | string[] | undefined>;
      schoolSync?: SchoolSyncContext;
    }>();

    const apiKey =
      request.body?.apiKey ||
      (typeof request.headers?.['x-school-sync-key'] === 'string'
        ? request.headers['x-school-sync-key']
        : undefined);

    if (!apiKey?.trim()) {
      throw new UnauthorizedException({ code: 'SYNC_KEY_REQUIRED', message: 'School sync API key required' });
    }

    const school = await this.prisma.school.findFirst({
      where: { syncApiKey: apiKey.trim() },
      select: { id: true, name: true, syncApiKey: true },
    });
    if (!school?.syncApiKey) {
      throw new UnauthorizedException({ code: 'SYNC_KEY_INVALID', message: 'Invalid school sync API key' });
    }

    const deviceId = request.params?.deviceId ?? request.params?.id;
    if (deviceId) {
      const device = await this.prisma.biometricDeviceConfig.findFirst({
        where: { id: deviceId, schoolId: school.id },
        select: { id: true },
      });
      if (!device) {
        throw new ForbiddenException({ code: 'DEVICE_NOT_IN_SCHOOL', message: 'Device not found for this school' });
      }
    }

    request.schoolSync = {
      schoolId: school.id,
      schoolName: school.name,
      syncApiKey: school.syncApiKey,
    };
    return true;
  }
}
