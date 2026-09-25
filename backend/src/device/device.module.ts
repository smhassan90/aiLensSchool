import { Module } from '@nestjs/common';
import { DeviceController, TeacherAttendanceReportController } from './device.controller';
import { DeviceOfflineController } from './device-offline.controller';
import { DeviceService } from './device.service';
import { BiometricAttendanceService } from './biometric-attendance.service';
import { DeviceSyncKeyService } from './device-sync-key.service';
import { ZktService } from './zkt.service';
import { SchoolSyncKeyGuard } from './school-sync-key.guard';

@Module({
  controllers: [DeviceController, DeviceOfflineController, TeacherAttendanceReportController],
  providers: [
    DeviceService,
    BiometricAttendanceService,
    DeviceSyncKeyService,
    ZktService,
    SchoolSyncKeyGuard,
  ],
  exports: [DeviceService, BiometricAttendanceService],
})
export class DeviceModule {}
