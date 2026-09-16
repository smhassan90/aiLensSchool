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

  @Roles(RoleName.SCHOOL_ADMIN)
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
