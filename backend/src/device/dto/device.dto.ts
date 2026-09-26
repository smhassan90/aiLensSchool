import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateDeviceDto {
  @IsString()
  name!: string;

  @IsString()
  ipAddress!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(86400)
  syncIntervalSeconds?: number;
}

export class EdgeSyncSettingsDto {
  @IsOptional()
  @IsIn(['school_local', 'utc'])
  punchTimeMode?: 'school_local' | 'utc';

  @IsOptional()
  @IsBoolean()
  preferUdp?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(120)
  connectionTimeoutSec?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(86400)
  userSyncIntervalSec?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  batchSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(3600)
  configRefreshIntervalSec?: number;
}

export class UpdateAttendanceSetupDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(72)
  autoCheckoutHours?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => EdgeSyncSettingsDto)
  edgeSync?: EdgeSyncSettingsDto;
}

export class UpdateDeviceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  port?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(86400)
  syncIntervalSeconds?: number;
}

export class OfflineApiKeyDto {
  @IsOptional()
  @IsString()
  apiKey?: string;
}

export class OfflineSyncUserRowDto {
  @IsString()
  deviceUserId!: string;

  @IsOptional()
  @IsString()
  deviceUserName?: string;

  @IsOptional()
  @IsString()
  deviceBadgeId?: string;
}

export class OfflineSyncUsersDto extends OfflineApiKeyDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfflineSyncUserRowDto)
  users!: OfflineSyncUserRowDto[];
}

export class OfflinePunchDto {
  @IsOptional()
  @IsString()
  deviceUserId?: string;

  @IsOptional()
  @IsString()
  uid?: string;

  @IsOptional()
  recordTime!: string | number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  type?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  state?: number;
}

export class OfflineSyncAttendanceDto extends OfflineApiKeyDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfflinePunchDto)
  logs!: OfflinePunchDto[];

  @IsOptional()
  @IsIn(['school_local', 'utc'])
  punchTimeMode?: 'school_local' | 'utc';
}

export class MappingRowDto {
  @IsString()
  deviceUserId!: string;

  @IsString()
  teacherId!: string;
}

export class ConfirmMappingsDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MappingRowDto)
  mappings?: MappingRowDto[];
}

export class TeacherAttendanceHistoryQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

export class ManualAttendanceDto {
  @IsString()
  teacherId!: string;

  @IsString()
  date!: string;

  @IsOptional()
  @IsString()
  time?: string;
}
