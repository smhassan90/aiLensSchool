import { Injectable } from '@nestjs/common';
import { AttendanceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  dateFromIso,
  earliestPunch,
  loadTeacherAttendancePolicy,
  statusFromCheckIn,
  zonedDateIso,
} from '../teachers/teacher-checkin';
import {
  isBadgeGhostUser,
  latestPunch,
  NormalizedPunch,
  parseRecordTime,
  punchDirectionFromRaw,
  PunchTimeMode,
  resolveDeviceUserId,
} from './biometric-punch.util';

export type RawPunchLog = {
  deviceUserId?: string;
  uid?: string;
  id?: string;
  userSn?: string;
  recordTime: string | number;
  type?: number;
  state?: number;
};

export type SyncAttendanceResult = {
  applied: number;
  pending: number;
  skipped: number;
  autoCheckouts: number;
};

@Injectable()
export class BiometricAttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async syncUsers(
    deviceConfigId: string,
    users: Array<{ deviceUserId: string; deviceUserName?: string; deviceBadgeId?: string }>,
  ) {
    const ops = users.map((user) =>
      this.prisma.biometricDeviceUser.upsert({
        where: {
          deviceConfigId_deviceUserId: {
            deviceConfigId,
            deviceUserId: user.deviceUserId,
          },
        },
        create: {
          deviceConfigId,
          deviceUserId: user.deviceUserId,
          deviceUserName: user.deviceUserName ?? null,
          deviceBadgeId: user.deviceBadgeId ?? null,
        },
        update: {
          deviceUserName: user.deviceUserName ?? null,
          deviceBadgeId: user.deviceBadgeId ?? null,
        },
      }),
    );
    await this.prisma.$transaction(ops);
    await this.prisma.biometricDeviceConfig.update({
      where: { id: deviceConfigId },
      data: { lastSyncAt: new Date() },
    });
    return { upserted: users.length };
  }

  normalizeLogs(
    logs: RawPunchLog[],
    timeZone: string,
    punchTimeMode: PunchTimeMode,
  ): NormalizedPunch[] {
    const byUserDay = new Map<string, NormalizedPunch[]>();
    const normalized: NormalizedPunch[] = [];

    for (const log of logs) {
      const deviceUserId = resolveDeviceUserId(log as Record<string, unknown>);
      if (!deviceUserId) continue;
      const recordTime = parseRecordTime(log.recordTime, timeZone, punchTimeMode);
      if (Number.isNaN(recordTime.getTime())) continue;
      let direction = punchDirectionFromRaw(log.type, log.state);
      const attendanceDate = zonedDateIso(recordTime, timeZone);
      const dayKey = `${deviceUserId}:${attendanceDate}`;
      if (!direction) {
        const existing = byUserDay.get(dayKey) ?? [];
        direction = existing.length % 2 === 0 ? 'in' : 'out';
      }
      const punch: NormalizedPunch = { deviceUserId, recordTime, direction };
      normalized.push(punch);
      byUserDay.set(dayKey, [...(byUserDay.get(dayKey) ?? []), punch]);
    }

    normalized.sort((a, b) => a.recordTime.getTime() - b.recordTime.getTime());
    return normalized;
  }

  async processPunchBatch(input: {
    schoolId: string;
    deviceConfigId: string;
    logs: RawPunchLog[];
    punchTimeMode?: PunchTimeMode;
    deviceSerialNumber?: string | null;
  }): Promise<SyncAttendanceResult> {
    const policy = await loadTeacherAttendancePolicy(this.prisma, input.schoolId);
    const punchTimeMode = input.punchTimeMode ?? 'school_local';
    const punches = this.normalizeLogs(input.logs, policy.timezone, punchTimeMode);

    const mappings = await this.prisma.biometricDeviceUserMapping.findMany({
      where: { deviceConfigId: input.deviceConfigId, isActive: true },
      select: { deviceUserId: true, teacherId: true },
    });
    const teacherByDeviceUser = new Map(mappings.map((m) => [m.deviceUserId, m.teacherId]));

    let applied = 0;
    let pending = 0;
    let skipped = 0;

    for (const punch of punches) {
      const teacherId = teacherByDeviceUser.get(punch.deviceUserId);
      if (!teacherId) {
        try {
          await this.prisma.pendingBiometricAttendanceLog.create({
            data: {
              schoolId: input.schoolId,
              deviceConfigId: input.deviceConfigId,
              deviceUserId: punch.deviceUserId,
              recordTime: punch.recordTime,
              punchType: punch.direction === 'in' ? 0 : 1,
              punchState: punch.direction === 'in' ? 0 : 1,
            },
          });
          pending += 1;
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            skipped += 1;
          } else {
            throw error;
          }
        }
        continue;
      }
      await this.applyPunchToAttendance({
        schoolId: input.schoolId,
        teacherId,
        punch,
        deviceUserId: punch.deviceUserId,
        deviceSerialNumber: input.deviceSerialNumber ?? null,
      });
      applied += 1;
    }

    await this.prisma.biometricDeviceConfig.update({
      where: { id: input.deviceConfigId },
      data: { lastSyncAt: new Date() },
    });

    const autoCheckouts = await this.runAutoCheckoutPolicy(input.schoolId);
    return { applied, pending, skipped, autoCheckouts };
  }

  async applyPunchToAttendance(input: {
    schoolId: string;
    teacherId: string;
    punch: NormalizedPunch;
    deviceUserId: string;
    deviceSerialNumber?: string | null;
  }) {
    const policy = await loadTeacherAttendancePolicy(this.prisma, input.schoolId);
    const dateIso = zonedDateIso(input.punch.recordTime, policy.timezone);
    const day = dateFromIso(dateIso);

    const existing = await this.prisma.teacherAttendance.findUnique({
      where: { teacherId_date: { teacherId: input.teacherId, date: day } },
    });

    if (input.punch.direction === 'in') {
      const checkedInAt = earliestPunch(existing?.checkedInAt, input.punch.recordTime);
      const status = statusFromCheckIn(
        checkedInAt,
        policy.lateAfter,
        policy.absentAfter,
        policy.timezone,
      );
      await this.prisma.teacherAttendance.upsert({
        where: { teacherId_date: { teacherId: input.teacherId, date: day } },
        create: {
          schoolId: input.schoolId,
          teacherId: input.teacherId,
          date: day,
          status,
          checkedInAt,
          source: 'MACHINE',
          deviceUserId: input.deviceUserId,
          deviceSerialNumber: input.deviceSerialNumber ?? null,
        },
        update: {
          status,
          checkedInAt,
          source: 'MACHINE',
          deviceUserId: existing?.deviceUserId ?? input.deviceUserId,
          deviceSerialNumber: input.deviceSerialNumber ?? existing?.deviceSerialNumber ?? null,
        },
      });
      return;
    }

    const checkedOutAt = latestPunch(existing?.checkedOutAt, input.punch.recordTime);
    if (!existing) {
      await this.prisma.teacherAttendance.create({
        data: {
          schoolId: input.schoolId,
          teacherId: input.teacherId,
          date: day,
          status: AttendanceStatus.PRESENT,
          checkedOutAt,
          source: 'MACHINE',
          deviceUserId: input.deviceUserId,
          deviceSerialNumber: input.deviceSerialNumber ?? null,
        },
      });
      return;
    }

    await this.prisma.teacherAttendance.update({
      where: { teacherId_date: { teacherId: input.teacherId, date: day } },
      data: {
        checkedOutAt,
        source: existing.source === 'SYSTEM' ? 'MACHINE' : existing.source,
        deviceUserId: existing.deviceUserId ?? input.deviceUserId,
        deviceSerialNumber: input.deviceSerialNumber ?? existing.deviceSerialNumber ?? null,
      },
    });
  }

  async replayPendingForMapping(deviceConfigId: string, deviceUserId: string, teacherId: string) {
    const device = await this.prisma.biometricDeviceConfig.findUnique({
      where: { id: deviceConfigId },
      select: { schoolId: true, serialNumber: true },
    });
    if (!device) return { applied: 0 };

    const pending = await this.prisma.pendingBiometricAttendanceLog.findMany({
      where: { deviceConfigId, deviceUserId },
      orderBy: { recordTime: 'asc' },
    });

    let applied = 0;
    for (const row of pending) {
      const direction = punchDirectionFromRaw(row.punchType, row.punchState) ?? 'in';
      await this.applyPunchToAttendance({
        schoolId: device.schoolId,
        teacherId,
        punch: { deviceUserId, recordTime: row.recordTime, direction },
        deviceUserId,
        deviceSerialNumber: device.serialNumber,
      });
      applied += 1;
    }

    if (pending.length) {
      await this.prisma.pendingBiometricAttendanceLog.deleteMany({
        where: { deviceConfigId, deviceUserId },
      });
    }
    return { applied };
  }

  async runAutoCheckoutPolicy(schoolId: string): Promise<number> {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { autoCheckoutHours: true },
    });
    const hours = school?.autoCheckoutHours ?? 24;
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    const openRows = await this.prisma.teacherAttendance.findMany({
      where: {
        schoolId,
        checkedOutAt: null,
        checkedInAt: { not: null, lte: cutoff },
      },
      select: { id: true, checkedInAt: true },
    });

    if (!openRows.length) return 0;

    await this.prisma.$transaction(
      openRows.map((row) =>
        this.prisma.teacherAttendance.update({
          where: { id: row.id },
          data: {
            checkedOutAt: new Date((row.checkedInAt?.getTime() ?? Date.now()) + hours * 60 * 60 * 1000),
          },
        }),
      ),
    );
    return openRows.length;
  }

  filterMappingCandidates(
    users: Array<{ deviceUserId: string; deviceUserName?: string | null; deviceBadgeId?: string | null }>,
  ) {
    return users.filter((user) => !isBadgeGhostUser(user, users));
  }
}
