import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller({ path: 'dashboard', version: '1' })
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Roles(RoleName.SCHOOL_ADMIN)
  @Get('school')
  school(@CurrentUser() user: AuthUser) {
    return this.dashboardService.schoolSummary(user);
  }

  @Roles(RoleName.TEACHER)
  @Get('teacher')
  teacher(@CurrentUser() user: AuthUser) {
    return this.dashboardService.teacherSummary(user);
  }
}
