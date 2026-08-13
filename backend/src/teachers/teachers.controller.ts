import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName, TeacherStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TeachersService } from './teachers.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto } from '../common/dto/pagination.dto';

class TeacherQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsEnum(TeacherStatus)
  status?: TeacherStatus;
}

@ApiTags('Teachers')
@ApiBearerAuth()
@Controller({ path: 'teachers', version: '1' })
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Roles(RoleName.TEACHER)
  @Get('me/classes')
  myClasses(@CurrentUser() user: AuthUser) {
    return this.teachersService.myClasses(user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @Post()
  create(@Body() dto: CreateTeacherDto, @CurrentUser() user: AuthUser) {
    return this.teachersService.create(dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @Get()
  findAll(@Query() query: TeacherQueryDto, @CurrentUser() user: AuthUser) {
    return this.teachersService.findAll(user, query);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.teachersService.findOne(id, user);
  }
}
