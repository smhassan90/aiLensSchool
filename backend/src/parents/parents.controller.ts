import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { ParentsService } from './parents.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto } from '../common/dto/pagination.dto';

class ParentQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;
}

@ApiTags('Parents')
@ApiBearerAuth()
@Controller({ path: 'parents', version: '1' })
export class ParentsController {
  constructor(private readonly parentsService: ParentsService) {}

  @Roles(RoleName.PARENT)
  @Get('me/children')
  myChildren(@CurrentUser() user: AuthUser) {
    return this.parentsService.getChildren(user.id);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @Get()
  findAll(@Query() query: ParentQueryDto, @CurrentUser() user: AuthUser) {
    return this.parentsService.findAll(user, query);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @Get(':id/children')
  getChildren(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.parentsService.getParentChildren(id, user);
  }
}
