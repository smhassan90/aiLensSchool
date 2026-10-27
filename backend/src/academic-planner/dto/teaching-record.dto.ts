import { TeachingRecordStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ActualLessonOutcomeDto {
  @IsString()
  @MaxLength(64)
  lessonKey!: string;

  @IsEnum(['COMPLETED', 'PARTIAL'] as const)
  outcome!: 'COMPLETED' | 'PARTIAL';

  @IsOptional()
  @IsArray()
  completedStageIndexes?: number[];
}

export class UpsertTeachingRecordDto {
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsInt()
  @Min(0)
  periodNumber!: number;

  @IsEnum(TeachingRecordStatus)
  status!: TeachingRecordStatus;

  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ActualLessonOutcomeDto)
  actualLessons!: ActualLessonOutcomeDto[];

  @IsOptional()
  @IsUUID()
  actualLibraryChapterId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  completedPortionNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  unfinishedPortionNote?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  actualMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
