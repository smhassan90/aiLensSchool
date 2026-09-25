import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TeacherStatus } from '@prisma/client';
import type { Prisma as PrismaTypes } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { paginate, pageQuery } from '../common/dto/pagination.dto';
import { BiometricAttendanceService } from './biometric-attendance.service';
import { DeviceSyncKeyService } from './device-sync-key.service';
import { ZktService } from './zkt.service';
import { normalizeTeacherName } from './biometric-punch.util';
import { teacherDisplayName } from '../common/utils/person-name';
import { dateFromIso, zonedDateIso } from '../teachers/teacher-checkin';
import {
  EdgeSyncSettings,
  mergeEdgeSyncIntoMetadata,
  readEdgeSyncFromMetadata,
} from './edge-sync-settings';

@Injectable()
export class DeviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly biometricAttendance: BiometricAttendanceService,
    private readonly syncKeys: DeviceSyncKeyService,
    private readonly zkt: ZktService,
    private readonly config: ConfigService,
  ) {}

  resolvePublicApiBaseUrl(): string {
    const fromEnv =
      this.config.get<string>('PUBLIC_API_BASE_URL')?.trim() ||
      this.config.get<string>('API_PUBLIC_BASE_URL')?.trim();
    if (fromEnv) return fromEnv.replace(/\/$/, '');
    const port = this.config.get<string>('PORT') ?? '3001';
    return `http://localhost:${port}/api/v1`;
  }

  private requireSchool(user: AuthUser) {
    return this.tenant.requireSchoolId(user);
  }

  async getTabletSyncSetup(user: AuthUser) {
    const setup = await this.getAttendanceSetup(user);
    return {
      apiKey: setup.apiKey,
      timezone: setup.timezone,
      devices: setup.devices,
    };
  }

  async getAttendanceSetup(user: AuthUser) {
    const schoolId = this.requireSchool(user);
    const apiKey = await this.syncKeys.ensureSchoolSyncKey(schoolId);
    const [school, settings, devices] = await Promise.all([
      this.prisma.school.findUnique({
        where: { id: schoolId },
        select: { name: true, autoCheckoutHours: true },
      }),
      this.prisma.schoolSettings.findUnique({
        where: { schoolId },
        select: { timezone: true, metadata: true },
      }),
      this.prisma.biometricDeviceConfig.findMany({
        where: { schoolId },
        orderBy: { name: 'asc' },
      }),
    ]);
    const edgeSync = readEdgeSyncFromMetadata(settings?.metadata);
    return {
      schoolName: school?.name ?? '',
      apiKey,
      backendUrl: this.resolvePublicApiBaseUrl(),
      timezone: settings?.timezone ?? 'Asia/Karachi',
      autoCheckoutHours: school?.autoCheckoutHours ?? 24,
      edgeSync,
      devices,
    };
  }

  async updateAttendanceSetup(
    user: AuthUser,
    input: {
      autoCheckoutHours?: number;
      edgeSync?: Partial<EdgeSyncSettings>;
    },
  ) {
    const schoolId = this.requireSchool(user);
    const settings = await this.prisma.schoolSettings.findUnique({
      where: { schoolId },
      select: { metadata: true },
    });
    const current = readEdgeSyncFromMetadata(settings?.metadata);
    const edgeSync: EdgeSyncSettings = {
      ...current,
      ...(input.edgeSync ?? {}),
    };

    if (input.autoCheckoutHours !== undefined) {
      if (input.autoCheckoutHours < 1 || input.autoCheckoutHours > 72) {
        throw new BadRequestException({
          code: 'INVALID_AUTO_CHECKOUT',
          message: 'autoCheckoutHours must be between 1 and 72',
        });
      }
      await this.prisma.school.update({
        where: { id: schoolId },
        data: { autoCheckoutHours: input.autoCheckoutHours },
      });
    }

    await this.prisma.schoolSettings.upsert({
      where: { schoolId },
      create: {
        schoolId,
        metadata: mergeEdgeSyncIntoMetadata(null, edgeSync) as PrismaTypes.InputJsonValue,
      },
      update: {
        metadata: mergeEdgeSyncIntoMetadata(settings?.metadata, edgeSync) as PrismaTypes.InputJsonValue,
      },
    });

    return this.getAttendanceSetup(user);
  }

  async getEdgeAgentConfigOffline(deviceId: string, schoolId: string) {
    const [device, school, settings] = await Promise.all([
      this.prisma.biometricDeviceConfig.findFirst({
        where: { id: deviceId, schoolId },
      }),
      this.prisma.school.findUnique({
        where: { id: schoolId },
        select: { name: true, autoCheckoutHours: true },
      }),
      this.prisma.schoolSettings.findUnique({
        where: { schoolId },
        select: { timezone: true, metadata: true },
      }),
    ]);
    if (!device) {
      throw new ForbiddenException({ code: 'DEVICE_NOT_IN_SCHOOL', message: 'Device not found' });
    }
    const edgeSync = readEdgeSyncFromMetadata(settings?.metadata);
    return {
      backendUrl: this.resolvePublicApiBaseUrl(),
      deviceId: device.id,
      schoolName: school?.name ?? '',
      deviceName: device.name,
      deviceIp: device.ipAddress,
      devicePort: device.port,
      schoolTimezone: settings?.timezone ?? 'Asia/Karachi',
      syncIntervalSec: device.syncIntervalSeconds,
      userSyncIntervalSec: edgeSync.userSyncIntervalSec,
      connectionTimeoutSec: edgeSync.connectionTimeoutSec,
      batchSize: edgeSync.batchSize,
      preferUdp: edgeSync.preferUdp,
      punchTimeMode: edgeSync.punchTimeMode,
      configRefreshIntervalSec: edgeSync.configRefreshIntervalSec,
      autoCheckoutHours: school?.autoCheckoutHours ?? 24,
      isActive: device.isActive,
      fullSync: Boolean(device.fullSyncRequestedAt),
      configVersion: device.updatedAt.toISOString(),
    };
  }

  async requestFullSync(user: AuthUser, deviceId: string) {
    await this.getDevice(user, deviceId);
    await this.prisma.biometricDeviceConfig.update({
      where: { id: deviceId },
      data: { fullSyncRequestedAt: new Date() },
    });
    return { requested: true };
  }

  async ackFullSyncOffline(deviceId: string, schoolId: string) {
    const device = await this.prisma.biometricDeviceConfig.findFirst({
      where: { id: deviceId, schoolId },
    });
    if (!device) {
      throw new ForbiddenException({ code: 'DEVICE_NOT_IN_SCHOOL', message: 'Device not found' });
    }
    await this.prisma.biometricDeviceConfig.update({
      where: { id: deviceId },
      data: { fullSyncRequestedAt: null },
    });
    return { cleared: true };
  }

  async regenerateSyncKey(user: AuthUser) {
    const schoolId = this.requireSchool(user);
    const apiKey = await this.syncKeys.regenerateSchoolSyncKey(schoolId);
    return { apiKey };
  }

  async listDevices(user: AuthUser) {
    const schoolId = this.requireSchool(user);
    return this.prisma.biometricDeviceConfig.findMany({
      where: { schoolId },
      orderBy: { name: 'asc' },
    });
  }

  async createDevice(
    user: AuthUser,
    input: { name: string; ipAddress: string; port?: number; syncIntervalSeconds?: number },
  ) {
    const schoolId = this.requireSchool(user);
    return this.prisma.biometricDeviceConfig.create({
      data: {
        schoolId,
        name: input.name.trim(),
        ipAddress: input.ipAddress.trim(),
        port: input.port ?? 4370,
        ...(input.syncIntervalSeconds !== undefined
          ? { syncIntervalSeconds: input.syncIntervalSeconds }
          : {}),
      },
    });
  }

  async getDevice(user: AuthUser, id: string) {
    const schoolId = this.requireSchool(user);
    const device = await this.prisma.biometricDeviceConfig.findFirst({
      where: { id, schoolId },
    });
    if (!device) throw new NotFoundException({ code: 'DEVICE_NOT_FOUND', message: 'Device not found' });
    return device;
  }

  async updateDevice(
    user: AuthUser,
    id: string,
    input: Partial<{
      name: string;
      ipAddress: string;
      port: number;
      isActive: boolean;
      syncIntervalSeconds: number;
    }>,
  ) {
    await this.getDevice(user, id);
    return this.prisma.biometricDeviceConfig.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress.trim() } : {}),
        ...(input.port !== undefined ? { port: input.port } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.syncIntervalSeconds !== undefined
          ? { syncIntervalSeconds: input.syncIntervalSeconds }
          : {}),
      },
    });
  }

  async deleteDevice(user: AuthUser, id: string) {
    await this.getDevice(user, id);
    await this.prisma.biometricDeviceConfig.delete({ where: { id } });
    return { deleted: true };
  }

  async testDevice(user: AuthUser, id: string) {
    const device = await this.getDevice(user, id);
    return this.zkt.testConnection(device.ipAddress, device.port);
  }

  async syncUsers(user: AuthUser, id: string) {
    await this.getDevice(user, id);
    return this.zkt.syncUsersFromDevice(id);
  }

  async syncAttendance(user: AuthUser, id: string, startDate?: string, endDate?: string) {
    await this.getDevice(user, id);
    return this.zkt.syncAttendanceFromDevice(id, startDate, endDate);
  }

  async listDevicesOffline(schoolId: string) {
    const [school, devices] = await Promise.all([
      this.prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
      this.prisma.biometricDeviceConfig.findMany({
        where: { schoolId, isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, ipAddress: true, port: true },
      }),
    ]);
    return {
      schoolName: school?.name ?? '',
      backendUrl: this.resolvePublicApiBaseUrl(),
      devices,
    };
  }

  async offlineTest(deviceId: string, schoolId: string) {
    const device = await this.prisma.biometricDeviceConfig.findFirst({
      where: { id: deviceId, schoolId },
      include: { school: { select: { name: true } } },
    });
    if (!device) throw new ForbiddenException({ code: 'DEVICE_NOT_IN_SCHOOL', message: 'Device not found' });
    return { ok: true, schoolName: device.school.name, deviceName: device.name };
  }

  async offlineSyncUsers(
    deviceId: string,
    schoolId: string,
    users: Array<{ deviceUserId: string; deviceUserName?: string; deviceBadgeId?: string }>,
  ) {
    const device = await this.prisma.biometricDeviceConfig.findFirst({
      where: { id: deviceId, schoolId },
    });
    if (!device) throw new ForbiddenException({ code: 'DEVICE_NOT_IN_SCHOOL', message: 'Device not found' });
    return this.biometricAttendance.syncUsers(deviceId, users);
  }

  async offlineSyncAttendance(
    deviceId: string,
    schoolId: string,
    body: {
      logs: import('./biometric-attendance.service').RawPunchLog[];
      punchTimeMode?: 'school_local' | 'utc';
    },
  ) {
    const device = await this.prisma.biometricDeviceConfig.findFirst({
      where: { id: deviceId, schoolId },
    });
    if (!device) throw new ForbiddenException({ code: 'DEVICE_NOT_IN_SCHOOL', message: 'Device not found' });

    return this.biometricAttendance.processPunchBatch({
      schoolId,
      deviceConfigId: deviceId,
      logs: body.logs,
      punchTimeMode: body.punchTimeMode,
      deviceSerialNumber: device.serialNumber,
    });
  }

  async mappingCandidates(user: AuthUser, deviceId: string) {
    const schoolId = this.requireSchool(user);
    await this.getDevice(user, deviceId);

    const [deviceUsers, mappings, teachers, pendingGroups] = await Promise.all([
      this.prisma.biometricDeviceUser.findMany({ where: { deviceConfigId: deviceId } }),
      this.prisma.biometricDeviceUserMapping.findMany({
        where: { deviceConfigId: deviceId, isActive: true },
        select: { deviceUserId: true, teacherId: true },
      }),
      this.prisma.teacherProfile.findMany({
        where: { schoolId, status: TeacherStatus.ACTIVE },
        select: {
          id: true,
          employeeCode: true,
          gender: true,
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.pendingBiometricAttendanceLog.groupBy({
        by: ['deviceUserId'],
        where: { deviceConfigId: deviceId },
        _count: { _all: true },
      }),
    ]);

    const mappedDeviceUsers = new Set(mappings.map((m) => m.deviceUserId));
    const mappedTeachers = new Set(mappings.map((m) => m.teacherId));
    const pendingByUser = new Map(pendingGroups.map((g) => [g.deviceUserId, g._count._all]));

    const candidates = this.biometricAttendance.filterMappingCandidates(deviceUsers);
    const unmappedDeviceUsers = candidates
      .filter((u) => !mappedDeviceUsers.has(u.deviceUserId))
      .map((u) => ({
        deviceUserId: u.deviceUserId,
        deviceUserName: u.deviceUserName,
        deviceBadgeId: u.deviceBadgeId,
        pendingCount: pendingByUser.get(u.deviceUserId) ?? 0,
      }));

    const teacherRows = teachers.map((t) => ({
      id: t.id,
      name: teacherDisplayName(t.user.firstName, t.user.lastName, t.gender),
      employeeCode: t.employeeCode,
      normalizedName: normalizeTeacherName(t.user.firstName, t.user.lastName),
    }));

    const unmappedTeachers = teacherRows.filter((t) => !mappedTeachers.has(t.id));

    const suggestions = unmappedDeviceUsers
      .map((deviceUser) => {
        const normalizedDeviceName = deviceUser.deviceUserName?.trim().replace(/\s+/g, ' ').toLowerCase();
        if (!normalizedDeviceName) return null;
        const matches = unmappedTeachers.filter((t) => t.normalizedName === normalizedDeviceName);
        if (matches.length !== 1) return null;
        return {
          deviceUserId: deviceUser.deviceUserId,
          teacherId: matches[0].id,
          teacherName: matches[0].name,
          deviceUserName: deviceUser.deviceUserName,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    return {
      unmappedDeviceUsers,
      unmappedTeachers: unmappedTeachers.map(({ normalizedName: _n, ...rest }) => rest),
      suggestions,
      pendingCounts: Object.fromEntries(pendingByUser),
    };
  }

  async confirmMappings(
    user: AuthUser,
    deviceId: string,
    mappings: Array<{ deviceUserId: string; teacherId: string }>,
  ) {
    const schoolId = this.requireSchool(user);
    await this.getDevice(user, deviceId);
    if (!mappings.length) {
      throw new BadRequestException({ code: 'MAPPINGS_REQUIRED', message: 'Provide at least one mapping' });
    }

    let pendingApplied = 0;
    for (const row of mappings) {
      const deviceUser = await this.prisma.biometricDeviceUser.findUnique({
        where: { deviceConfigId_deviceUserId: { deviceConfigId: deviceId, deviceUserId: row.deviceUserId } },
      });
      await this.prisma.biometricDeviceUserMapping.upsert({
        where: {
          deviceConfigId_deviceUserId: { deviceConfigId: deviceId, deviceUserId: row.deviceUserId },
        },
        create: {
          deviceConfigId: deviceId,
          teacherId: row.teacherId,
          deviceUserId: row.deviceUserId,
          deviceUserName: deviceUser?.deviceUserName ?? null,
        },
        update: {
          teacherId: row.teacherId,
          isActive: true,
          deviceUserName: deviceUser?.deviceUserName ?? null,
        },
      });
      const teacher = await this.prisma.teacherProfile.findFirst({
        where: { id: row.teacherId, schoolId },
      });
      if (!teacher) {
        throw new BadRequestException({ code: 'TEACHER_NOT_IN_SCHOOL', message: 'Teacher not in this school' });
      }
      const replay = await this.biometricAttendance.replayPendingForMapping(
        deviceId,
        row.deviceUserId,
        row.teacherId,
      );
      pendingApplied += replay.applied;
    }
    return { mappings: mappings.length, pendingPunchesApplied: pendingApplied };
  }

  async listMappings(user: AuthUser, deviceId: string) {
    await this.getDevice(user, deviceId);
    return this.prisma.biometricDeviceUserMapping.findMany({
      where: { deviceConfigId: deviceId },
      include: {
        teacher: {
          select: {
            id: true,
            employeeCode: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateMapping(user: AuthUser, mappingId: string, isActive: boolean) {
    const schoolId = this.requireSchool(user);
    const mapping = await this.prisma.biometricDeviceUserMapping.findUnique({
      where: { id: mappingId },
      include: { deviceConfig: { select: { schoolId: true } } },
    });
    if (!mapping || mapping.deviceConfig.schoolId !== schoolId) {
      throw new NotFoundException({ code: 'MAPPING_NOT_FOUND', message: 'Mapping not found' });
    }
    return this.prisma.biometricDeviceUserMapping.update({
      where: { id: mappingId },
      data: { isActive },
    });
  }

  async deleteMapping(user: AuthUser, mappingId: string) {
    const schoolId = this.requireSchool(user);
    const mapping = await this.prisma.biometricDeviceUserMapping.findUnique({
      where: { id: mappingId },
      include: { deviceConfig: { select: { schoolId: true } } },
    });
    if (!mapping || mapping.deviceConfig.schoolId !== schoolId) {
      throw new NotFoundException({ code: 'MAPPING_NOT_FOUND', message: 'Mapping not found' });
    }
    await this.prisma.biometricDeviceUserMapping.delete({ where: { id: mappingId } });
    return { deleted: true };
  }

  async listTeacherAttendanceHistory(
    user: AuthUser,
    query: {
      teacherId?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const schoolId = this.requireSchool(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortOrder = query.sortOrder ?? 'desc';

    const where: {
      schoolId: string;
      teacherId?: string;
      date?: { gte?: Date; lte?: Date };
    } = { schoolId };
    if (query.teacherId) where.teacherId = query.teacherId;
    if (query.startDate || query.endDate) {
      where.date = {};
      if (query.startDate) where.date.gte = dateFromIso(query.startDate);
      if (query.endDate) where.date.lte = dateFromIso(query.endDate);
    }

    const orderBy: Prisma.TeacherAttendanceOrderByWithRelationInput[] =
      query.sortBy === 'teacher'
        ? [
            { teacher: { user: { firstName: sortOrder } } },
            { date: sortOrder },
          ]
        : [{ date: sortOrder }, { teacher: { user: { firstName: 'asc' } } }];

    const [rows, total] = await pageQuery(
      (skip, take) =>
        this.prisma.teacherAttendance.findMany({
          where,
          skip,
          take,
          orderBy,
          include: {
            teacher: {
              select: {
                id: true,
                employeeCode: true,
                gender: true,
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        }),
      () => this.prisma.teacherAttendance.count({ where }),
      page,
      limit,
    );

    const data = rows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      teacher: {
        id: row.teacher.id,
        name: teacherDisplayName(
          row.teacher.user.firstName,
          row.teacher.user.lastName,
          row.teacher.gender,
        ),
        employeeCode: row.teacher.employeeCode,
      },
      checkInTime: row.checkedInAt?.toISOString() ?? null,
      checkOutTime: row.checkedOutAt?.toISOString() ?? null,
      status: row.status,
      source: row.source,
    }));

    return { data, ...paginate(data, total, page, limit) };
  }

  async listTeachersDropdown(user: AuthUser) {
    const schoolId = this.requireSchool(user);
    const teachers = await this.prisma.teacherProfile.findMany({
      where: { schoolId, status: TeacherStatus.ACTIVE },
      orderBy: [{ user: { firstName: 'asc' } }, { user: { lastName: 'asc' } }],
      select: {
        id: true,
        employeeCode: true,
        gender: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    return teachers.map((t) => ({
      id: t.id,
      name: teacherDisplayName(t.user.firstName, t.user.lastName, t.gender),
      employeeCode: t.employeeCode,
    }));
  }

  async manualCheckIn(user: AuthUser, input: { teacherId: string; date: string; time?: string }) {
    const schoolId = this.requireSchool(user);
    const policy = await this.prisma.schoolSettings.findUnique({ where: { schoolId } });
    const tz = policy?.timezone ?? 'Asia/Karachi';
    const instant = input.time
      ? new Date(input.time)
      : new Date(`${input.date}T12:00:00.000Z`);
    const day = dateFromIso(input.date);
    await this.biometricAttendance.applyPunchToAttendance({
      schoolId,
      teacherId: input.teacherId,
      punch: { deviceUserId: 'manual', recordTime: instant, direction: 'in' },
      deviceUserId: 'manual',
    });
    const row = await this.prisma.teacherAttendance.findUnique({
      where: { teacherId_date: { teacherId: input.teacherId, date: day } },
    });
    if (row) {
      await this.prisma.teacherAttendance.update({
        where: { id: row.id },
        data: { source: 'ADMIN', recordedById: user.id },
      });
    }
    return { ok: true, timezone: tz };
  }

  async manualCheckOut(user: AuthUser, input: { teacherId: string; date: string; time?: string }) {
    const schoolId = this.requireSchool(user);
    const instant = input.time
      ? new Date(input.time)
      : new Date(`${input.date}T18:00:00.000Z`);
    const day = dateFromIso(input.date);
    await this.biometricAttendance.applyPunchToAttendance({
      schoolId,
      teacherId: input.teacherId,
      punch: { deviceUserId: 'manual', recordTime: instant, direction: 'out' },
      deviceUserId: 'manual',
    });
    const row = await this.prisma.teacherAttendance.findUnique({
      where: { teacherId_date: { teacherId: input.teacherId, date: day } },
    });
    if (row) {
      await this.prisma.teacherAttendance.update({
        where: { id: row.id },
        data: { source: 'ADMIN', recordedById: user.id },
      });
    }
    return { ok: true };
  }

  async pendingCountByDevice(schoolId: string, deviceId: string) {
    return this.prisma.pendingBiometricAttendanceLog.count({ where: { deviceConfigId: deviceId, schoolId } });
  }
}
