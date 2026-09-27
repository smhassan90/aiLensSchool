import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString } from 'class-validator';
import { ExceptionLogService, API_EXCEPTION_RETENTION_DAYS } from '../exception-logs/exception-log.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { PlatformService } from './platform.service';
import { PurgePlatformDataDto } from './dto/purge-platform-data.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

class ExceptionLogQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  statusCode?: number;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

class ClearExceptionLogsDto {
  @IsBoolean()
  confirm!: boolean;
}

class ActivityQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

@ApiTags('Platform')
@ApiBearerAuth()
@Roles(RoleName.SUPER_ADMIN)
@Controller({ path: 'platform', version: '1' })
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly exceptionLogs: ExceptionLogService,
  ) {}

  @Get('ai-usage/schools')
  listSchoolAiUsage() {
    return this.platform.listSchoolAiUsage();
  }

  @Get('ai-usage/schools/:schoolId')
  getSchoolAiUsage(@Param('schoolId') schoolId: string) {
    return this.platform.getSchoolAiUsage(schoolId);
  }

  @Get('ai-usage/schools/:schoolId/teachers/:teacherId')
  getTeacherTrail(@Param('schoolId') schoolId: string, @Param('teacherId') teacherId: string) {
    return this.platform.getTeacherLessonTrail(schoolId, teacherId);
  }

  @Get('activity')
  listActivity(@Query() query: ActivityQueryDto) {
    return this.platform.listActivity(query);
  }

  @Post('data-purge')
  purgeData(@Body() dto: PurgePlatformDataDto, @CurrentUser() user: AuthUser) {
    return this.platform.purgeData(dto, user.id);
  }

  @Get('exception-logs')
  listExceptionLogs(@Query() query: ExceptionLogQueryDto) {
    return this.exceptionLogs.findAll(query);
  }

  @Get('exception-logs/retention')
  exceptionRetentionPolicy() {
    return { retentionDays: API_EXCEPTION_RETENTION_DAYS };
  }

  @Delete('exception-logs')
  clearExceptionLogs(@Body() dto: ClearExceptionLogsDto) {
    return this.exceptionLogs.clearAll(dto.confirm);
  }
}
