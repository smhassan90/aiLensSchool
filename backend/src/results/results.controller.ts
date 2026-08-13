import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { ResultsService } from './results.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto } from '../common/dto/pagination.dto';

class ResultsQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  quizId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;
}

@ApiTags('Results')
@ApiBearerAuth()
@Controller({ path: 'results', version: '1' })
export class ResultsController {
  constructor(private readonly resultsService: ResultsService) {}

  @Roles(RoleName.TEACHER, RoleName.SCHOOL_ADMIN)
  @Get('quiz/:quizId/stats')
  classStats(@Param('quizId') quizId: string, @CurrentUser() user: AuthUser) {
    return this.resultsService.classStats(quizId, user);
  }

  @Roles(RoleName.TEACHER, RoleName.SCHOOL_ADMIN, RoleName.PARENT)
  @Get()
  findAll(@Query() query: ResultsQueryDto, @CurrentUser() user: AuthUser) {
    return this.resultsService.findAll(user, query);
  }
}
