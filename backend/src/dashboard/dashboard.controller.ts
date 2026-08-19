import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermission } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller({ path: 'dashboard', version: '1' })
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('VIEW_DASHBOARD')
  @Get('school')
  school(@CurrentUser() user: AuthUser) {
    return this.dashboardService.schoolSummary(user);
  }

  @Roles(RoleName.TEACHER)
  @Get('teacher')
  teacher(@CurrentUser() user: AuthUser) {
    return this.dashboardService.teacherSummary(user);
  }

  @Roles(RoleName.TEACHER)
  @Get('teacher/coach')
  teacherCoachGet(@CurrentUser() user: AuthUser) {
    return this.dashboardService.teacherCoach(user);
  }

  @Roles(RoleName.TEACHER)
  @Post('teacher/coach')
  teacherCoach(@CurrentUser() user: AuthUser) {
    return this.dashboardService.teacherCoach(user);
  }
}
