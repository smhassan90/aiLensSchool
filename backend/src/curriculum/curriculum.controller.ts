import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurriculumService } from './curriculum.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('Curriculum')
@ApiBearerAuth()
@Controller({ path: 'curriculum', version: '1' })
export class CurriculumController {
  constructor(private readonly curriculumService: CurriculumService) {}

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get()
  list(@Query() query: PaginationDto, @CurrentUser() user: AuthUser) {
    return this.curriculumService.list(user, query);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.curriculumService.findOne(id, user);
  }
}
