import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { HomeworkService } from './homework.service';
import { CreateHomeworkDto } from './dto/create-homework.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto } from '../common/dto/pagination.dto';

class HomeworkQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;
}

@ApiTags('Homework')
@ApiBearerAuth()
@Controller({ path: 'homework', version: '1' })
export class HomeworkController {
  constructor(private readonly homeworkService: HomeworkService) {}

  @Roles(RoleName.TEACHER, RoleName.SCHOOL_ADMIN)
  @Post()
  create(@Body() dto: CreateHomeworkDto, @CurrentUser() user: AuthUser) {
    return this.homeworkService.create(dto, user);
  }

  @Roles(RoleName.TEACHER, RoleName.SCHOOL_ADMIN, RoleName.PARENT)
  @Get()
  findAll(@Query() query: HomeworkQueryDto, @CurrentUser() user: AuthUser) {
    return this.homeworkService.findAll(user, query);
  }

  @Roles(RoleName.TEACHER, RoleName.SCHOOL_ADMIN, RoleName.PARENT)
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Query('studentId') studentId: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.homeworkService.findOne(id, user, studentId);
  }
}
