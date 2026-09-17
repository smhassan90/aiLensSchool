import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EnrollmentStatus, RoleName } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AcademicsService } from './academics.service';
import {
  AssignClassSubjectDto,
  CreateAcademicYearDto,
  CreateEnrollmentDto,
  CreateGradeDto,
  CreateSchoolStageDto,
  CreateSectionDto,
  CreateSubjectDto,
  UpdateGradeDto,
  UpdateSchoolStageDto,
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

  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;
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

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get('stages')
  listStages(@CurrentUser() user: AuthUser) {
    return this.academicsService.listStages(user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('MANAGE_CLASSES')
  @Post('stages')
  createStage(@Body() dto: CreateSchoolStageDto, @CurrentUser() user: AuthUser) {
    return this.academicsService.createStage(dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('MANAGE_CLASSES')
  @Patch('stages/:id')
  updateStage(
    @Param('id') id: string,
    @Body() dto: UpdateSchoolStageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.academicsService.updateStage(id, dto, user);
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
  @Patch('grades/:id')
  updateGrade(@Param('id') id: string, @Body() dto: UpdateGradeDto, @CurrentUser() user: AuthUser) {
    return this.academicsService.updateGrade(id, dto, user);
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

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get('sections/:id')
  getSection(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.academicsService.getSection(id, user);
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

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get('class-subjects')
  listClassSubjects(@Query() query: ClassSubjectQueryDto, @CurrentUser() user: AuthUser) {
    return this.academicsService.listClassSubjects(user, query);
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
    @Body() body: { gradeId?: string; subjectId?: string; minQuizzes: number },
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
    @Body() body: {
      academicYearId: string;
      pattern: string;
      examSubmissionDaysBefore?: number;
      exams?: Array<{ name: string; maxMarks: number; sequence: number; startDate?: string; endDate?: string }>;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.academicsService.saveExamPattern(user, body);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get('exam-configs')
  listExamConfigs(@Query('academicYearId') academicYearId: string | undefined, @CurrentUser() user: AuthUser) {
    return this.academicsService.listExamConfigs(user, academicYearId);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get('exam-settings')
  getExamSettings(@CurrentUser() user: AuthUser) {
    return this.academicsService.getExamSettings(user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('MANAGE_EXAMS')
  @Get('exam-paper-assignments')
  listExamPaperAssignments(
    @Query('examConfigId') examConfigId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.academicsService.listExamPaperAssignments(user, examConfigId);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('MANAGE_EXAMS')
  @Post('exam-paper-assignments')
  saveExamPaperAssignments(
    @Body()
    body: {
      examConfigId: string;
      release?: boolean;
      applyToAll?: boolean;
      maxMarks?: number;
      submissionDueAt?: string;
      scoreEntryDueAt?: string;
      examDate?: string;
      questionSpec?: {
        mcqCount: number;
        fillBlankCount: number;
        trueFalseCount: number;
        shortAnswerCount: number;
        longAnswerCount: number;
        mcqMarks: number;
        fillBlankMarks: number;
        trueFalseMarks: number;
        shortAnswerMarks: number;
        longAnswerMarks: number;
      } | null;
      rows?: Array<{
        sectionId: string;
        subjectId: string;
        teacherId?: string | null;
        maxMarks: number;
        submissionDueAt: string;
        enabled?: boolean;
      }>;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.academicsService.saveExamPaperAssignments(user, body);
  }

  @Roles(RoleName.TEACHER)
  @Get('my-exam-paper-assignments')
  listMyExamPaperAssignments(@CurrentUser() user: AuthUser) {
    return this.academicsService.listMyExamPaperAssignments(user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @Get('exam-paper-submissions')
  getExamPaperSubmissions(
    @Query('examConfigId') examConfigId: string | undefined,
    @Query('sectionId') sectionId: string | undefined,
    @Query('subjectId') subjectId: string | undefined,
    @Query('teacherId') teacherId: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.academicsService.getExamPaperSubmissions(user, {
      examConfigId,
      sectionId,
      subjectId,
      teacherId,
    });
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

  @Roles(RoleName.TEACHER)
  @Post('exam-deadline-extension-requests')
  requestExamDeadlineExtension(
    @Body()
    body: { assignmentId: string; kind: 'paper' | 'score'; days: 1 | 2 | 3 },
    @CurrentUser() user: AuthUser,
  ) {
    return this.academicsService.requestExamDeadlineExtension(user, body);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('MANAGE_EXAMS')
  @Get('exam-deadline-extension-requests')
  listExamDeadlineExtensionRequests(@CurrentUser() user: AuthUser) {
    return this.academicsService.listExamDeadlineExtensionRequests(user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('MANAGE_EXAMS')
  @Post('exam-deadline-extension-requests/:id/approve')
  approveExamDeadlineExtensionRequest(
    @Param('id') id: string,
    @Body() body: { days?: 1 | 2 | 3 },
    @CurrentUser() user: AuthUser,
  ) {
    return this.academicsService.approveExamDeadlineExtensionRequest(user, id, body.days);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('MANAGE_EXAMS')
  @Post('exam-deadline-extensions')
  extendExamDeadlines(
    @Body()
    body: {
      teacherUserId: string;
      examConfigId: string;
      kind: 'paper' | 'score' | 'both';
      days: 1 | 2 | 3;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.academicsService.extendExamDeadlines(user, body);
  }

  @Roles(RoleName.TEACHER, RoleName.SCHOOL_ADMIN)
  @Get('exam-score-sheet')
  getExamScoreSheet(
    @Query('examConfigId') examConfigId: string,
    @Query('sectionId') sectionId: string,
    @Query('subjectId') subjectId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.academicsService.getExamScoreSheet(user, {
      examConfigId,
      sectionId,
      subjectId,
    });
  }

  @Roles(RoleName.TEACHER, RoleName.SCHOOL_ADMIN)
  @Post('exam-scores')
  saveExamScores(
    @Body()
    body: {
      examConfigId: string;
      sectionId: string;
      subjectId: string;
      scores: Array<{ studentId: string; marks: number }>;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.academicsService.saveExamScores(user, body);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('MANAGE_EXAMS')
  @Patch('exam-configs/:id/date')
  setExamDate(
    @Param('id') id: string,
    @Body() body: { examDate: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.academicsService.setExamConfigDate(user, id, body.examDate);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get('timetable')
  listTimetable(@Query('gradeId') gradeId: string | undefined, @CurrentUser() user: AuthUser) {
    return this.academicsService.listTimetable(user, gradeId);
  }
}

