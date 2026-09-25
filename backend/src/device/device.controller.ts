import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { DeviceService } from './device.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermission } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import {
  ConfirmMappingsDto,
  CreateDeviceDto,
  ManualAttendanceDto,
  TeacherAttendanceHistoryQueryDto,
  UpdateAttendanceSetupDto,
  UpdateDeviceDto,
} from './dto/device.dto';
import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

class SyncAttendanceQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

class UpdateMappingDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@ApiTags('Device')
@ApiBearerAuth()
@Controller({ path: 'device', version: '1' })
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('VIEW_BIOMETRIC_DEVICES')
  @Get('attendance-setup')
  attendanceSetup(@CurrentUser() user: AuthUser) {
    return this.deviceService.getAttendanceSetup(user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_BIOMETRIC_DEVICES')
  @Put('attendance-setup')
  updateAttendanceSetup(@CurrentUser() user: AuthUser, @Body() dto: UpdateAttendanceSetupDto) {
    return this.deviceService.updateAttendanceSetup(user, dto);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('VIEW_BIOMETRIC_DEVICES')
  @Get('tablet-sync-setup')
  tabletSyncSetup(@CurrentUser() user: AuthUser) {
    return this.deviceService.getTabletSyncSetup(user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_BIOMETRIC_DEVICES')
  @Post('tablet-sync/regenerate-key')
  regenerateKey(@CurrentUser() user: AuthUser) {
    return this.deviceService.regenerateSyncKey(user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('VIEW_BIOMETRIC_DEVICES')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.deviceService.listDevices(user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_BIOMETRIC_DEVICES')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDeviceDto) {
    return this.deviceService.createDevice(user, dto);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('VIEW_BIOMETRIC_DEVICES')
  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deviceService.getDevice(user, id);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_BIOMETRIC_DEVICES')
  @Put(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDeviceDto) {
    return this.deviceService.updateDevice(user, id, dto);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_BIOMETRIC_DEVICES')
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deviceService.deleteDevice(user, id);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_BIOMETRIC_DEVICES')
  @Post(':id/test')
  test(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deviceService.testDevice(user, id);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_BIOMETRIC_DEVICES')
  @Post(':id/sync-users')
  syncUsers(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deviceService.syncUsers(user, id);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_BIOMETRIC_DEVICES')
  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_BIOMETRIC_DEVICES')
  @Post(':id/request-full-sync')
  requestFullSync(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deviceService.requestFullSync(user, id);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_BIOMETRIC_DEVICES')
  @Post(':id/sync-attendance')
  syncAttendance(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: SyncAttendanceQueryDto,
  ) {
    return this.deviceService.syncAttendance(user, id, query.startDate, query.endDate);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('VIEW_BIOMETRIC_DEVICES')
  @Get(':id/mapping-candidates')
  mappingCandidates(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deviceService.mappingCandidates(user, id);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_BIOMETRIC_DEVICES')
  @Post(':id/mappings/confirm')
  confirmMappings(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ConfirmMappingsDto,
  ) {
    return this.deviceService.confirmMappings(user, id, dto.mappings);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('VIEW_BIOMETRIC_DEVICES')
  @Get(':id/mappings')
  listMappings(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deviceService.listMappings(user, id);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_BIOMETRIC_DEVICES')
  @Put('mappings/:mappingId')
  updateMapping(
    @CurrentUser() user: AuthUser,
    @Param('mappingId') mappingId: string,
    @Body() dto: UpdateMappingDto,
  ) {
    return this.deviceService.updateMapping(user, mappingId, dto.isActive ?? true);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_BIOMETRIC_DEVICES')
  @Delete('mappings/:mappingId')
  deleteMapping(@CurrentUser() user: AuthUser, @Param('mappingId') mappingId: string) {
    return this.deviceService.deleteMapping(user, mappingId);
  }
}

@ApiTags('Teacher attendance')
@ApiBearerAuth()
@Controller({ path: 'teacher-attendance', version: '1' })
export class TeacherAttendanceReportController {
  constructor(private readonly deviceService: DeviceService) {}

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('VIEW_TEACHER_ATTENDANCE_HISTORY')
  @Get()
  history(@CurrentUser() user: AuthUser, @Query() query: TeacherAttendanceHistoryQueryDto) {
    return this.deviceService.listTeacherAttendanceHistory(user, query);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('VIEW_TEACHER_ATTENDANCE_HISTORY')
  @Get('teachers')
  teachers(@CurrentUser() user: AuthUser) {
    return this.deviceService.listTeachersDropdown(user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_TEACHER_ATTENDANCE')
  @Post('manual-check-in')
  manualCheckIn(@CurrentUser() user: AuthUser, @Body() dto: ManualAttendanceDto) {
    return this.deviceService.manualCheckIn(user, dto);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_TEACHER_ATTENDANCE')
  @Post('manual-check-out')
  manualCheckOut(@CurrentUser() user: AuthUser, @Body() dto: ManualAttendanceDto) {
    return this.deviceService.manualCheckOut(user, dto);
  }
}
