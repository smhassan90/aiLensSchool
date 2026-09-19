import { Body, Controller, Get, Put, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { HeadTeachersService } from './head-teachers.service';
import { HeadTeacherListQueryDto, SaveHeadTeacherBoardDto } from './dto/head-teachers.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermission } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { InsightsService } from '../insights/insights.service';

@ApiTags('Head Teachers')
@ApiBearerAuth()
@Controller({ path: 'head-teachers', version: '1' })
export class HeadTeachersController {
  constructor(
    private readonly headTeachers: HeadTeachersService,
    private readonly insights: InsightsService,
  ) {}

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('MANAGE_TEACHERS')
  @Get('board')
  getBoard(@CurrentUser() user: AuthUser) {
    return this.headTeachers.getBoard(user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('MANAGE_TEACHERS')
  @Put('board')
  saveBoard(@Body() dto: SaveHeadTeacherBoardDto, @CurrentUser() user: AuthUser) {
    return this.headTeachers.saveBoard(user, dto);
  }

  @Roles(RoleName.TEACHER)
  @Get('me')
  getMyAssignment(@CurrentUser() user: AuthUser) {
    return this.headTeachers.getMyAssignment(user);
  }

  @Roles(RoleName.TEACHER)
  @Get('me/dashboard')
  getDashboard(@CurrentUser() user: AuthUser) {
    return this.headTeachers.getDashboard(user);
  }

  @Roles(RoleName.TEACHER)
  @Get('me/attendance')
  getAttendance(@CurrentUser() user: AuthUser) {
    return this.headTeachers.getAttendanceOverview(user);
  }

  @Roles(RoleName.TEACHER)
  @Get('me/students/search')
  searchStudents(@Query('q') q: string, @CurrentUser() user: AuthUser) {
    return this.headTeachers.searchStudents(user, q ?? '');
  }

  @Roles(RoleName.TEACHER)
  @Get('me/students/:id')
  async studentOverview(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.headTeachers.assertStudentAccess(user, id);
    return this.insights.studentOverview(id, user);
  }

  @Roles(RoleName.TEACHER)
  @Get('me/teachers/progress')
  getTeacherProgress(@CurrentUser() user: AuthUser) {
    return this.headTeachers.getTeacherProgress(user);
  }

  @Roles(RoleName.TEACHER)
  @Get('me/quizzes')
  listQuizzes(@Query() query: HeadTeacherListQueryDto, @CurrentUser() user: AuthUser) {
    return this.headTeachers.listQuizzes(user, query);
  }

  @Roles(RoleName.TEACHER)
  @Get('me/homework')
  listHomework(@Query() query: HeadTeacherListQueryDto, @CurrentUser() user: AuthUser) {
    return this.headTeachers.listHomework(user, query);
  }

  @Roles(RoleName.TEACHER)
  @Get('me/results')
  listResults(@Query() query: HeadTeacherListQueryDto, @CurrentUser() user: AuthUser) {
    return this.headTeachers.listResults(user, query);
  }

  @Roles(RoleName.TEACHER)
  @Get('me/exam-paper-submissions')
  getExamPaperSubmissions(@Query() query: HeadTeacherListQueryDto, @CurrentUser() user: AuthUser) {
    return this.headTeachers.getExamPaperSubmissions(user, query);
  }
}
