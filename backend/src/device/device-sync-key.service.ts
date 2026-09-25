import { randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class DeviceSyncKeyService {
  constructor(private readonly prisma: PrismaService) {}

  generateKey(schoolId: string): string {
    const token = randomBytes(24).toString('hex');
    return `hnx_${schoolId}_${token}`;
  }

  async ensureSchoolSyncKey(schoolId: string): Promise<string> {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { syncApiKey: true },
    });
    if (school?.syncApiKey) return school.syncApiKey;

    const syncApiKey = this.generateKey(schoolId);
    await this.prisma.school.update({
      where: { id: schoolId },
      data: { syncApiKey },
    });
    return syncApiKey;
  }

  async regenerateSchoolSyncKey(schoolId: string): Promise<string> {
    const syncApiKey = this.generateKey(schoolId);
    await this.prisma.school.update({
      where: { id: schoolId },
      data: { syncApiKey },
    });
    return syncApiKey;
  }
}
