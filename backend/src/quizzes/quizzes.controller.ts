import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QuizStatus, RoleName } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { QuizzesService } from './quizzes.service';
import {
  AddQuizQuestionDto,
  GenerateQuizDto,
  PublishQuizDto,
  RejectExamPaperDto,
  SubmitExamPaperDto,
  SubmitQuizDto,
  UpdateQuizQuestionsDto,
} from './dto/quiz.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto } from '../common/dto/pagination.dto';

class QuizQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsEnum(QuizStatus)
  status?: QuizStatus;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  paperKind?: string;
}

@ApiTags('Quizzes')
@ApiBearerAuth()
@Controller({ path: 'quizzes', version: '1' })
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  @Roles(RoleName.TEACHER, RoleName.SCHOOL_ADMIN)
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  generate(@Body() dto: GenerateQuizDto, @CurrentUser() user: AuthUser) {
    return this.quizzesService.generateFromLessons(dto, user);
  }

  @Roles(RoleName.TEACHER, RoleName.SCHOOL_ADMIN, RoleName.PARENT)
  @Get()
  findAll(@Query() query: QuizQueryDto, @CurrentUser() user: AuthUser) {
    return this.quizzesService.findAll(user, query);
  }

  @Roles(RoleName.TEACHER, RoleName.SCHOOL_ADMIN, RoleName.PARENT)
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Query('studentId') studentId: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quizzesService.findOne(id, user, studentId);
  }

  @Roles(RoleName.TEACHER, RoleName.SCHOOL_ADMIN)
  @Post(':id/questions')
  addQuestion(
    @Param('id') id: string,
    @Body() dto: AddQuizQuestionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quizzesService.addQuestion(id, dto, user);
  }

  @Roles(RoleName.TEACHER, RoleName.SCHOOL_ADMIN)
  @Patch(':id/questions')
  updateQuestions(
    @Param('id') id: string,
    @Body() dto: UpdateQuizQuestionsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quizzesService.updateQuestions(id, dto, user);
  }

  @Roles(RoleName.TEACHER, RoleName.SCHOOL_ADMIN)
  @Post(':id/publish')
  publish(
    @Param('id') id: string,
    @Body() dto: PublishQuizDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quizzesService.publish(id, dto, user);
  }

  @Roles(RoleName.TEACHER, RoleName.SCHOOL_ADMIN)
  @Post(':id/submit-paper')
  submitPaper(
    @Param('id') id: string,
    @Body() dto: SubmitExamPaperDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quizzesService.submitForPrint(id, user, dto);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL, RoleName.TEACHER)
  @Post(':id/approve-paper')
  approvePaper(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.quizzesService.approvePaper(id, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL, RoleName.TEACHER)
  @Post(':id/reject-paper')
  rejectPaper(
    @Param('id') id: string,
    @Body() dto: RejectExamPaperDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quizzesService.rejectPaper(id, dto.reason, user);
  }

  @Roles(RoleName.PARENT)
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  submit(
    @Param('id') id: string,
    @Body() dto: SubmitQuizDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.quizzesService.submitAttempt(id, dto, user);
  }
}
