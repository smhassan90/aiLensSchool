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
import { RequirePermission } from '../common/decorators/permissions.decorator';
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
  @RequirePermission('MANAGE_CLASSES')
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
  @RequirePermission('MANAGE_CLASSES')
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
  @RequirePermission('MANAGE_CLASSES')
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
  @RequirePermission('MANAGE_CLASSES')
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
  @RequirePermission('MANAGE_CLASSES')
  @Post('class-subjects')
  assignClassSubject(@Body() dto: AssignClassSubjectDto, @CurrentUser() user: AuthUser) {
    return this.academicsService.assignClassSubject(dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('MANAGE_CLASSES')
  @Post('sections/:id/class-teacher')
  setClassTeacher(
    @Param('id') id: string,
    @Body() body: { classTeacherId?: string | null },
    @CurrentUser() user: AuthUser,
  ) {
    return this.academicsService.setClassTeacher(id, body.classTeacherId ?? null, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('SET_QUIZ_TARGETS')
  @Post('quiz-targets')
  upsertQuizTarget(
    @Body() body: { gradeId: string; subjectId: string; minQuizzes: number },
    @CurrentUser() user: AuthUser,
  ) {
    return this.academicsService.upsertQuizTarget(user, body);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get('quiz-targets')
  listQuizTargets(@CurrentUser() user: AuthUser) {
    return this.academicsService.listQuizTargets(user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('MANAGE_EXAMS')
  @Post('exam-configs')
  saveExamPattern(
    @Body() body: { academicYearId: string; pattern: string; exams: Array<{ name: string; maxMarks: number; sequence: number }> },
    @CurrentUser() user: AuthUser,
  ) {
    return this.academicsService.saveExamPattern(user, body);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get('exam-configs')
  listExamConfigs(@Query('academicYearId') academicYearId: string | undefined, @CurrentUser() user: AuthUser) {
    return this.academicsService.listExamConfigs(user, academicYearId);
  }

  @Roles(RoleName.TEACHER, RoleName.SCHOOL_ADMIN)
  @Get('assessments')
  listAssessments(
    @Query('sectionId') sectionId: string | undefined,
    @Query('subjectId') subjectId: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.academicsService.listAssessments(user, sectionId, subjectId);
  }

  @Roles(RoleName.TEACHER, RoleName.SCHOOL_ADMIN)
  @Post('assessments')
  addAssessment(
    @Body()
    body: {
      studentId: string;
      subjectId: string;
      sectionId: string;
      academicYearId: string;
      examConfigId?: string;
      type: 'CLASS_TEST' | 'PHYSICAL_TEST' | 'TERM_EXAM' | 'OTHER';
      title: string;
      maxMarks: number;
      marks: number;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.academicsService.addAssessment(user, body);
  }
}

