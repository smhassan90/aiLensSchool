import { PlannerExamType } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PlannerSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  revisionSlots?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(15)
  fallbackPeriodsPerWeek?: number;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(120)
  fallbackPeriodMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  minChapterStartMinutes?: number;
}

export class CreatePlannerDto {
  @IsUUID()
  sectionId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  teacherId!: string;

  @IsEnum(PlannerExamType)
  examType!: PlannerExamType;

  @IsOptional()
  @IsUUID()
  examConfigId?: string;

  @IsDateString()
  examDate!: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsUUID()
  libraryBookId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @IsUUID('4', { each: true })
  chapterIds!: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PlannerSettingsDto)
  settings?: PlannerSettingsDto;
}
