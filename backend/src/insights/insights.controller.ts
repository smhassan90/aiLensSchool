import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { InsightsService } from './insights.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';

class SearchQueryDto {
  @IsString()
  q!: string;
}

class ClassQueryDto {
  @IsOptional()
  @IsString()
  sectionId?: string;
}

@ApiTags('Insights')
@ApiBearerAuth()
@Controller({ path: '', version: '1' })
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get('search')
  search(@Query() query: SearchQueryDto, @CurrentUser() user: AuthUser) {
    return this.insights.search(user, query.q ?? '');
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get('insights/students/:id')
  student(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.insights.studentOverview(id, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @Get('insights/parents/:id')
  parent(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.insights.parentOverview(id, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get('insights/classes/:gradeId')
  classOverview(
    @Param('gradeId') gradeId: string,
    @Query() query: ClassQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.insights.classOverview(gradeId, user, query.sectionId);
  }
}
