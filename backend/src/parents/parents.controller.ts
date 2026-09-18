import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { ParentsService } from './parents.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateDayOffDto, DayOffQueryDto, ReviewDayOffDto } from './dto/day-off.dto';

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
  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.parentsService.resetPassword(id, user);
  }

  @Roles(RoleName.PARENT)
  @Post('day-off-requests')
  createDayOff(@Body() dto: CreateDayOffDto, @CurrentUser() user: AuthUser) {
    return this.parentsService.createDayOffRequest(dto, user);
  }

  @Roles(RoleName.PARENT, RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get('day-off-requests')
  listDayOff(@Query() query: DayOffQueryDto, @CurrentUser() user: AuthUser) {
    return this.parentsService.listDayOffRequests(query, user);
  }

  @Roles(RoleName.PARENT)
  @Delete('day-off-requests/:id')
  deleteDayOff(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.parentsService.deleteDayOffRequest(id, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @Patch('day-off-requests/:id/review')
  reviewDayOff(
    @Param('id') id: string,
    @Body() dto: ReviewDayOffDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.parentsService.reviewDayOffRequest(id, dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @Get(':id/children')
  getChildren(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.parentsService.getParentChildren(id, user);
  }
}
