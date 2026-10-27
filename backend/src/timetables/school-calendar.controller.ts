import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermission } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { SchoolCalendarService } from './school-calendar.service';
import { CreateSchoolCalendarDayDto, SchoolCalendarRangeQueryDto, WorkingDaysQueryDto } from './dto/school-calendar.dto';

@Controller({ path: 'academic-calendar', version: '1' })
export class SchoolCalendarController {
  constructor(private readonly calendar: SchoolCalendarService) {}

  @Get('days')
  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER, RoleName.PRINCIPAL)
  listDays(@CurrentUser() user: AuthUser, @Query() query: SchoolCalendarRangeQueryDto) {
    return this.calendar.listDays(user, query.from, query.to);
  }

  @Post('days')
  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_CLASSES')
  createDay(@CurrentUser() user: AuthUser, @Body() dto: CreateSchoolCalendarDayDto) {
    return this.calendar.createDay(user, dto);
  }

  @Delete('days/:id')
  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_CLASSES')
  deleteDay(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.calendar.deleteDay(user, id);
  }

  @Get('working-days')
  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER, RoleName.PRINCIPAL)
  workingDays(@CurrentUser() user: AuthUser, @Query() query: WorkingDaysQueryDto) {
    return this.calendar.workingDays(user, query.sectionId, query.from, query.to);
  }
}
