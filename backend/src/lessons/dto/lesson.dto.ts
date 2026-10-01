import {
  Allow,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClassSessionType, LessonRecordKind, LessonSourceType, LessonStatus } from '@prisma/client';

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pageText?: string;

  // Multer may also place the file field on the body; ignore it so whitelist validation does not reject the request.
  @Allow()
  pages?: unknown;

  @ApiPropertyOptional({ enum: LessonRecordKind })
  @IsOptional()
  @IsEnum(LessonRecordKind)
  recordKind?: LessonRecordKind;
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
  @IsEnum(LessonRecordKind)
  recordKind?: LessonRecordKind;

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

export class CreateChapterPasteDto {
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
  chapterName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  topicName?: string;

  @ApiProperty()
  @IsString()
  contentText!: string;
}

export class AppendChapterTextDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  text!: string;
}

export class ReorderChapterPagesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  sourceIds!: string[];
}

export class ConfirmChapterContentDto {
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
  contentText?: string;
}

export enum HomeworkSessionMode {
  NONE = 'NONE',
  PLAIN = 'PLAIN',
  AI = 'AI',
}

export class CreateClassSessionDto {
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

  @ApiProperty({ enum: ClassSessionType })
  @IsEnum(ClassSessionType)
  sessionType!: ClassSessionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chapterSourceId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  revisionChapterIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentSummary?: string;

  @ApiProperty({ enum: HomeworkSessionMode })
  @IsEnum(HomeworkSessionMode)
  homeworkMode!: HomeworkSessionMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  homeworkText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  homeworkDueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  homeworkInstruction?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  homeworkTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  homeworkDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  homeworkAnswerKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  homeworkQuestionsJson?: unknown;
}

export class SubjectPaceQueryDto {
  @ApiProperty()
  @IsString()
  sectionId!: string;

  @ApiProperty()
  @IsString()
  subjectId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teacherId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  academicYearId?: string;
}
