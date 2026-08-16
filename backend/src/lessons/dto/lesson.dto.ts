import {
  Allow,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LessonSourceType, LessonStatus } from '@prisma/client';

export class CreateLessonDto {
  @ApiProperty()
  @IsString()
  academicYearId!: string;

  @ApiProperty()
  @IsString()
  gradeId!: string;

  @ApiProperty()
  @IsString()
  sectionId!: string;

  @ApiProperty()
  @IsString()
  subjectId!: string;

  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiProperty()
  @IsDateString()
  date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chapterName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  topicName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teacherNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  pageFrom?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  pageTo?: number;
}

export class ScanLessonDto {
  @ApiProperty()
  @IsString()
  academicYearId!: string;

  @ApiProperty()
  @IsString()
  gradeId!: string;

  @ApiProperty()
  @IsString()
  sectionId!: string;

  @ApiProperty()
  @IsString()
  subjectId!: string;

  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiProperty()
  @IsDateString()
  date!: string;

  @ApiProperty({ enum: LessonSourceType })
  @IsEnum(LessonSourceType)
  sourceType!: LessonSourceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  manualText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileAssetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  pageFrom?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  pageTo?: number;
}

export class ExtractLessonDto {
  @ApiProperty()
  @IsString()
  academicYearId!: string;

  @ApiProperty()
  @IsString()
  gradeId!: string;

  @ApiProperty()
  @IsString()
  sectionId!: string;

  @ApiProperty()
  @IsString()
  subjectId!: string;

  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiProperty()
  @IsString()
  date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teacherNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pageFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pageTo?: string;

  // Multer may also place the file field on the body; ignore it so whitelist validation does not reject the request.
  @Allow()
  pages?: unknown;
}

export class UpdateLessonDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chapterName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  topicName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teacherNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  aiSummary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  extractedText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  pageFrom?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  pageTo?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  concepts?: string[];
}

export class RegenerateKeyPointsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instruction?: string;
}

export class LessonQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsEnum(LessonStatus)
  status?: LessonStatus;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;
}
