import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName, TeacherStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { TeachersService } from './teachers.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import {
  CheckInTeacherDto,
  SyncTeacherAttendanceDto,
  UpdateTeacherAttendancePolicyDto,
} from './dto/teacher-attendance.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermission } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto } from '../common/dto/pagination.dto';

class TeacherQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsEnum(TeacherStatus)
  status?: TeacherStatus;
}

class TeacherAttendanceQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;
}

class TeacherOverviewQueryDto {
  @IsOptional()
  @IsString()
  month?: string;
}

class TeacherClassInsightsQueryDto {
  @IsString()
  sectionId!: string;

  @IsString()
  subjectId!: string;
}

class TeacherSelfAttendanceHistoryQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

@ApiTags('Teachers')
@ApiBearerAuth()
@Controller({ path: 'teachers', version: '1' })
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Roles(RoleName.TEACHER)
  @Get('me/classes')
  myClasses(@CurrentUser() user: AuthUser) {
    return this.teachersService.myClasses(user);
  }

  @Roles(RoleName.TEACHER)
  @Get('me/supervision')
  mySupervision(@CurrentUser() user: AuthUser) {
    return this.teachersService.getTeacherSupervision(user);
  }

  @Roles(RoleName.TEACHER)
  @Get('me/overview')
  myOverview(@Query() query: TeacherOverviewQueryDto, @CurrentUser() user: AuthUser) {
    return this.teachersService.myOverview(user, query.month);
  }

  @Roles(RoleName.TEACHER)
  @Get('me/attendance/history')
  myAttendanceHistory(
    @Query() query: TeacherSelfAttendanceHistoryQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.teachersService.listAttendanceHistoryForTeacher(user, query);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('MANAGE_TEACHERS')
  @Post()
  create(@Body() dto: CreateTeacherDto, @CurrentUser() user: AuthUser) {
    return this.teachersService.create(dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('VIEW_TEACHER_PROGRESS')
  @Get('scoreboard')
  scoreboard(@CurrentUser() user: AuthUser) {
    return this.teachersService.scoreboard(user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('MANAGE_TEACHERS')
  @Get('attendance')
  listAttendance(@Query() query: TeacherAttendanceQueryDto, @CurrentUser() user: AuthUser) {
    return this.teachersService.listTeacherAttendance(user, query.date);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('MANAGE_TEACHERS')
  @Patch('attendance/policy')
  updateAttendancePolicy(
    @Body() dto: UpdateTeacherAttendancePolicyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.teachersService.updateTeacherAttendancePolicy(user, dto);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('MANAGE_TEACHERS')
  @Post('attendance/check-in')
  checkIn(@Body() dto: CheckInTeacherDto, @CurrentUser() user: AuthUser) {
    return this.teachersService.checkInTeacher(user, dto);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('MANAGE_TEACHERS')
  @Post('attendance/sync')
  syncMachine(@Body() dto: SyncTeacherAttendanceDto, @CurrentUser() user: AuthUser) {
    return this.teachersService.syncTeacherCheckIn(user, dto);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('VIEW_TEACHER_PROGRESS', 'MANAGE_TEACHERS')
  @Get()
  findAll(@Query() query: TeacherQueryDto, @CurrentUser() user: AuthUser) {
    return this.teachersService.findAll(user, query);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('MANAGE_TEACHERS')
  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.teachersService.resetPassword(id, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('VIEW_TEACHER_PROGRESS')
  @Get(':id/performance')
  performance(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.teachersService.performance(id, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL, RoleName.TEACHER)
  @Get(':id/overview')
  overview(
    @Param('id') id: string,
    @Query() query: TeacherOverviewQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.teachersService.overview(id, user, query.month);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL, RoleName.TEACHER)
  @Get(':id/class-insights')
  classInsights(
    @Param('id') id: string,
    @Query() query: TeacherClassInsightsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.teachersService.classInsights(id, user, query.sectionId, query.subjectId);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('VIEW_TEACHER_PROGRESS')
  @Get(':id/coach')
  coachGet(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.teachersService.coach(id, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('VIEW_TEACHER_PROGRESS')
  @Post(':id/coach')
  coach(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.teachersService.coach(id, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.teachersService.findOne(id, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('MANAGE_TEACHERS')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTeacherDto, @CurrentUser() user: AuthUser) {
    return this.teachersService.update(id, dto, user);
  }
}
