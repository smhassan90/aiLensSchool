import { PlannerLessonKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ExpectedRevisionDto } from './planner-edit.dto';

export class UpdatePlannerLessonDto extends ExpectedRevisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  objectives?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsEnum(PlannerLessonKind)
  kind?: PlannerLessonKind;
}

export class MovePlannerLessonDto extends ExpectedRevisionDto {
  @IsDateString()
  date!: string;

  @IsInt()
  @Min(1)
  periodNumber!: number;
}

export class RegeneratePlannerLessonDto extends ExpectedRevisionDto {
  @IsOptional()
  @IsBoolean()
  regenerateActivity?: boolean;
}

export class ChangeLessonKindDto extends ExpectedRevisionDto {
  @IsEnum(PlannerLessonKind)
  kind!: PlannerLessonKind;
}
