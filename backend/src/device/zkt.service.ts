import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { BiometricAttendanceService, RawPunchLog } from './biometric-attendance.service';
import { PrismaService } from '../database/prisma.service';
import { loadTeacherAttendancePolicy, zonedDateIso } from '../teachers/teacher-checkin';

type ZkLibInstance = {
  createSocket: () => Promise<void>;
  disconnect: () => Promise<void>;
  getUsers: () => Promise<Array<Record<string, unknown>>>;
  getAttendances: () => Promise<Array<Record<string, unknown>>>;
  getSerialNumber?: () => Promise<string>;
};

@Injectable()
export class ZktService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly biometricAttendance: BiometricAttendanceService,
  ) {}

  private async loadZkLib(): Promise<new (ip: string, port: number, timeout: number) => ZkLibInstance> {
    try {
      const mod = await import('node-zklib' as `${string}`);
      // ESM: { default: ZKLib }. CJS (compiled require): module.exports is the class — no .default.
      const ctor = (mod as { default?: unknown }).default ?? mod;
      if (typeof ctor !== 'function') {
        throw new Error('Invalid node-zklib export');
      }
      return ctor as new (ip: string, port: number, timeout: number) => ZkLibInstance;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException({
        code: 'ZKLIB_UNAVAILABLE',
        message:
          'Server cannot reach ZKTeco devices from this host. Use the Python edge sync agent on the school LAN.',
      });
    }
  }

  async testConnection(ipAddress: string, port: number) {
    const ZkLib = await this.loadZkLib();
    const zk = new ZkLib(ipAddress, port, 10000);
    try {
      await zk.createSocket();
      const serial = zk.getSerialNumber ? await zk.getSerialNumber() : null;
      await zk.disconnect();
      return { ok: true, serialNumber: serial };
    } catch (error) {
      await zk.disconnect().catch(() => undefined);
      throw new ServiceUnavailableException({
        code: 'DEVICE_UNREACHABLE',
        message: error instanceof Error ? error.message : 'Could not connect to biometric device',
      });
    }
  }

  async syncUsersFromDevice(deviceConfigId: string) {
    const device = await this.prisma.biometricDeviceConfig.findUnique({ where: { id: deviceConfigId } });
    if (!device) throw new ServiceUnavailableException({ code: 'DEVICE_NOT_FOUND', message: 'Device not found' });

    const ZkLib = await this.loadZkLib();
    const zk = new ZkLib(device.ipAddress, device.port, 10000);
    await zk.createSocket();
    const rawUsers = await zk.getUsers();
    await zk.disconnect();

    const users = rawUsers
      .map((row) => ({
        deviceUserId: String(row.uid ?? row.userId ?? row.id ?? '').trim(),
        deviceUserName: row.name ? String(row.name) : undefined,
        deviceBadgeId: row.userId ? String(row.userId) : undefined,
      }))
      .filter((row) => row.deviceUserId);

    return this.biometricAttendance.syncUsers(deviceConfigId, users);
  }

  async syncAttendanceFromDevice(deviceConfigId: string, startDate?: string, endDate?: string) {
    const device = await this.prisma.biometricDeviceConfig.findUnique({ where: { id: deviceConfigId } });
    if (!device) throw new ServiceUnavailableException({ code: 'DEVICE_NOT_FOUND', message: 'Device not found' });

    const policy = await loadTeacherAttendancePolicy(this.prisma, device.schoolId);
    const ZkLib = await this.loadZkLib();
    const zk = new ZkLib(device.ipAddress, device.port, 10000);
    await zk.createSocket();
    const rawLogs = await zk.getAttendances();
    await zk.disconnect();

    const logs: RawPunchLog[] = [];
    for (const row of rawLogs) {
      const deviceUserId = String(row.deviceUserId ?? row.uid ?? row.id ?? '').trim();
      const recordTime = row.recordTime ?? row.timestamp ?? row.time;
      if (!deviceUserId || recordTime === undefined) continue;
      logs.push({
        deviceUserId,
        recordTime: recordTime as string | number,
        type: typeof row.type === 'number' ? row.type : undefined,
        state: typeof row.state === 'number' ? row.state : undefined,
      });
    }

    const filtered = logs.filter((log) => {
      const dateIso = zonedDateIso(
        this.biometricAttendance.normalizeLogs([log], policy.timezone, 'school_local')[0]?.recordTime ??
          new Date(String(log.recordTime)),
        policy.timezone,
      );
      if (startDate && dateIso < startDate) return false;
      if (endDate && dateIso > endDate) return false;
      return true;
    });

    return this.biometricAttendance.processPunchBatch({
      schoolId: device.schoolId,
      deviceConfigId,
      logs: filtered,
      punchTimeMode: 'school_local',
      deviceSerialNumber: device.serialNumber,
    });
  }
}
