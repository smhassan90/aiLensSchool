import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { DeviceService } from './device.service';
import { SchoolSyncKeyGuard, SchoolSyncContext } from './school-sync-key.guard';
import {
  OfflineApiKeyDto,
  OfflineSyncAttendanceDto,
  OfflineSyncUsersDto,
} from './dto/device.dto';

type OfflineRequest = { schoolSync?: SchoolSyncContext };

@ApiTags('Device offline sync')
@SkipThrottle()
@Public()
@UseGuards(SchoolSyncKeyGuard)
@Controller({ path: 'device', version: '1' })
export class DeviceOfflineController {
  constructor(private readonly deviceService: DeviceService) {}

  @Post('list-offline')
  listDevices(@Req() req: OfflineRequest) {
    const schoolId = req.schoolSync!.schoolId;
    return this.deviceService.listDevicesOffline(schoolId);
  }

  @Post(':deviceId/test-backend-offline')
  testBackend(@Param('deviceId') deviceId: string, @Req() req: OfflineRequest) {
    const schoolId = req.schoolSync!.schoolId;
    return this.deviceService.offlineTest(deviceId, schoolId);
  }

  @Post(':deviceId/edge-config-offline')
  edgeConfig(@Param('deviceId') deviceId: string, @Req() req: OfflineRequest) {
    const schoolId = req.schoolSync!.schoolId;
    return this.deviceService.getEdgeAgentConfigOffline(deviceId, schoolId);
  }

  @Post(':deviceId/ack-full-sync-offline')
  ackFullSync(@Param('deviceId') deviceId: string, @Req() req: OfflineRequest) {
    const schoolId = req.schoolSync!.schoolId;
    return this.deviceService.ackFullSyncOffline(deviceId, schoolId);
  }

  @Post(':deviceId/sync-users-offline')
  syncUsers(
    @Param('deviceId') deviceId: string,
    @Body() dto: OfflineSyncUsersDto,
    @Req() req: OfflineRequest,
  ) {
    const schoolId = req.schoolSync!.schoolId;
    return this.deviceService.offlineSyncUsers(deviceId, schoolId, dto.users);
  }

  @Post(':deviceId/sync-attendance-offline')
  syncAttendance(
    @Param('deviceId') deviceId: string,
    @Body() dto: OfflineSyncAttendanceDto,
    @Req() req: OfflineRequest,
  ) {
    const schoolId = req.schoolSync!.schoolId;
    return this.deviceService.offlineSyncAttendance(deviceId, schoolId, dto);
  }
}
