import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { AcademicsService } from './academics.service';
import {
  AssignClassSubjectDto,
  CreateAcademicYearDto,
  CreateEnrollmentDto,
  CreateGradeDto,
  CreateSectionDto,
  CreateSubjectDto,
} from './dto/academics.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto } from '../common/dto/pagination.dto';

class SectionQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  gradeId?: string;
}

class SubjectQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  gradeId?: string;
}

class EnrollmentQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  academicYearId?: string;

  @IsOptional()
  @IsString()
  gradeId?: string;
}

class ClassSubjectQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  academicYearId?: string;

  @IsOptional()
  @IsString()
  gradeId?: string;
}

@ApiTags('Academics')
@ApiBearerAuth()
@Controller({ path: 'academics', version: '1' })
export class AcademicsController {
  constructor(private readonly academicsService: AcademicsService) {}

  @Roles(RoleName.SCHOOL_ADMIN)
  @Post('years')
  createYear(@Body() dto: CreateAcademicYearDto, @CurrentUser() user: AuthUser) {
    return this.academicsService.createAcademicYear(dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get('years')
  listYears(@Query() query: PaginationDto, @CurrentUser() user: AuthUser) {
    return this.academicsService.listAcademicYears(user, query);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @Post('grades')
  createGrade(@Body() dto: CreateGradeDto, @CurrentUser() user: AuthUser) {
    return this.academicsService.createGrade(dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get('grades')
  listGrades(@Query() query: PaginationDto, @CurrentUser() user: AuthUser) {
    return this.academicsService.listGrades(user, query);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get('grades/:id')
  getGrade(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.academicsService.getGrade(id, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @Post('sections')
  createSection(@Body() dto: CreateSectionDto, @CurrentUser() user: AuthUser) {
    return this.academicsService.createSection(dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get('sections')
  listSections(@Query() query: SectionQueryDto, @CurrentUser() user: AuthUser) {
    return this.academicsService.listSections(user, query);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @Post('subjects')
  createSubject(@Body() dto: CreateSubjectDto, @CurrentUser() user: AuthUser) {
    return this.academicsService.createSubject(dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get('subjects')
  listSubjects(@Query() query: SubjectQueryDto, @CurrentUser() user: AuthUser) {
    return this.academicsService.listSubjects(user, query);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @Post('enrollments')
  createEnrollment(@Body() dto: CreateEnrollmentDto, @CurrentUser() user: AuthUser) {
    return this.academicsService.createEnrollment(dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get('enrollments')
  listEnrollments(@Query() query: EnrollmentQueryDto, @CurrentUser() user: AuthUser) {
    return this.academicsService.listEnrollments(user, query);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @Post('class-subjects')
  assignClassSubject(@Body() dto: AssignClassSubjectDto, @CurrentUser() user: AuthUser) {
    return this.academicsService.assignClassSubject(dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get('class-subjects')
  listClassSubjects(@Query() query: ClassSubjectQueryDto, @CurrentUser() user: AuthUser) {
    return this.academicsService.listClassSubjects(user, query);
  }
}
