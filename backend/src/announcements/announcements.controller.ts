import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AnnouncementStatus, RoleName } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/announcement.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto } from '../common/dto/pagination.dto';

class AnnouncementQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(AnnouncementStatus)
  status?: AnnouncementStatus;
}

@ApiTags('Announcements')
@ApiBearerAuth()
@Controller({ path: 'announcements', version: '1' })
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Roles(RoleName.SCHOOL_ADMIN)
  @Post()
  create(@Body() dto: CreateAnnouncementDto, @CurrentUser() user: AuthUser) {
    return this.announcementsService.create(dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER, RoleName.PARENT)
  @Get()
  findAll(@Query() query: AnnouncementQueryDto, @CurrentUser() user: AuthUser) {
    return this.announcementsService.findAll(user, query);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER, RoleName.PARENT)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.announcementsService.findOne(id, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.announcementsService.update(id, dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @Post(':id/publish')
  publish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.announcementsService.publish(id, user);
  }
}
