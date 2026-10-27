import { TimetablePeriodKind, Weekday } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PeriodInputDto {
  @IsEnum(Weekday)
  weekday!: Weekday;

  @IsOptional()
  @IsInt()
  @Min(0)
  periodNumber?: number | null;

  @IsEnum(TimetablePeriodKind)
  kind!: TimetablePeriodKind;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  startTime?: string | null;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  endTime?: string | null;

  @IsString()
  @MaxLength(120)
  label!: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string | null;

  @IsOptional()
  @IsUUID()
  teacherId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  room?: string | null;
}

export class UpdateTimetableVersionDto {
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PeriodInputDto)
  periods!: PeriodInputDto[];
}

export class CreateManualVersionDto {
  @IsUUID()
  sectionId!: string;

  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  cloneFromVersionId?: string;
}

export class PublishTimetableItemDto {
  @IsUUID()
  versionId!: string;

  @IsInt()
  @Min(0)
  expectedRevision!: number;
}

export class PublishTimetableDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PublishTimetableItemDto)
  items!: PublishTimetableItemDto[];

  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom!: string;
}

export class LegacyAdoptDto {
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  sectionIds?: string[];
}
