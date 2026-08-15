import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QuizStatus, RoleName } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { QuizzesService } from './quizzes.service';
import {
  GenerateQuizDto,
  PublishQuizDto,
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
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.quizzesService.findOne(id, user);
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
}
