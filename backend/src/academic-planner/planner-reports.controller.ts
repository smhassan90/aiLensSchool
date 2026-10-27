import { Controller, Get, Param } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { PlannerReportsService } from './planner-reports.service';

@Controller({ path: 'planner-reports', version: '1' })
@Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER, RoleName.PRINCIPAL)
export class PlannerReportsController {
  constructor(private readonly reports: PlannerReportsService) {}

  @Get('planners/:id/progress')
  progress(@CurrentUser() user: AuthUser, @Param('id') plannerId: string) {
    return this.reports.plannerProgress(user, plannerId);
  }
}
