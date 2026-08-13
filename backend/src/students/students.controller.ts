import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName, StudentStatus } from '@prisma/client';
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto } from '../common/dto/pagination.dto';
import { IsEnum, IsOptional, IsString } from 'class-validator';

class StudentQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;
}

@ApiTags('Students')
@ApiBearerAuth()
@Controller({ path: 'students', version: '1' })
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Roles(RoleName.SCHOOL_ADMIN)
  @Post()
  create(@Body() dto: CreateStudentDto, @CurrentUser() user: AuthUser) {
    return this.studentsService.create(dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get()
  findAll(@Query() query: StudentQueryDto, @CurrentUser() user: AuthUser) {
    return this.studentsService.findAll(user, query);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER, RoleName.PARENT)
  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    if (user.roles.includes(RoleName.PARENT)) {
      await this.studentsService.assertParentOwnsStudent(user.id, id);
    }
    return this.studentsService.findOne(id, user);
  }
}
