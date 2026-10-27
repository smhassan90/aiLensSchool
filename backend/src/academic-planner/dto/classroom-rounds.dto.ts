import { LessonStage, ObservationMatch } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateObservationDto {
  @IsOptional()
  @IsUUID()
  clientRequestId?: string;

  @IsUUID()
  sectionId!: string;

  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  periodNumber?: number;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  observedLessonKey?: string;

  @IsOptional()
  @IsUUID()
  observedLibraryChapterId?: string;

  @IsOptional()
  @IsEnum(LessonStage)
  observedStage?: LessonStage;

  @IsOptional()
  @IsBoolean()
  teacherPresent?: boolean;

  @IsEnum(ObservationMatch)
  match!: ObservationMatch;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  followUpRequired?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  followUpAction?: string;

  @IsOptional()
  @IsDateString()
  followUpDueDate?: string;

  @IsOptional()
  @IsBoolean()
  sharedWithTeacher?: boolean;
}
