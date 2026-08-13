import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { DocumentsService } from './documents.service';
import {
  CreateDiaryDto,
  GenerateDiaryDto,
  GenerateHomeworkDto,
  GenerateIdCardDto,
  GenerateReportCardDto,
} from './dto/documents.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto } from '../common/dto/pagination.dto';

class DiaryQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  studentId?: string;
}

class ReportQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  academicYearId?: string;
}

class IdCardQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

@ApiTags('Documents')
@ApiBearerAuth()
@Controller({ path: 'documents', version: '1' })
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Post('diaries')
  createDiary(@Body() dto: CreateDiaryDto, @CurrentUser() user: AuthUser) {
    return this.documents.createDiary(dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Post('diaries/generate')
  generateDiary(@Body() dto: GenerateDiaryDto, @CurrentUser() user: AuthUser) {
    return this.documents.generateDiary(dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER, RoleName.PARENT)
  @Get('diaries')
  listDiaries(@Query() query: DiaryQueryDto, @CurrentUser() user: AuthUser) {
    return this.documents.listDiaries(user, query);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Post('homework/generate')
  generateHomework(@Body() dto: GenerateHomeworkDto, @CurrentUser() user: AuthUser) {
    return this.documents.generateHomework(dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @Post('report-cards/generate')
  generateReportCards(@Body() dto: GenerateReportCardDto, @CurrentUser() user: AuthUser) {
    return this.documents.generateReportCards(dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER, RoleName.PARENT)
  @Get('report-cards')
  listReportCards(@Query() query: ReportQueryDto, @CurrentUser() user: AuthUser) {
    return this.documents.listReportCards(user, query);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @Post('id-cards/generate')
  generateIdCards(@Body() dto: GenerateIdCardDto, @CurrentUser() user: AuthUser) {
    return this.documents.generateIdCards(dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get('id-cards')
  listIdCards(@Query() query: IdCardQueryDto, @CurrentUser() user: AuthUser) {
    return this.documents.listIdCards(user, query);
  }
}
