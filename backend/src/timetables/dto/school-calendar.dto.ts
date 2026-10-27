import { CalendarDayKind, Weekday } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateSchoolCalendarDayDto {
  @IsDateString()
  date!: string;

  @IsEnum(CalendarDayKind)
  kind!: CalendarDayKind;

  @IsIn(['ALL', 'GRADE', 'SECTION'])
  scope!: 'ALL' | 'GRADE' | 'SECTION';

  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsEnum(Weekday)
  followsWeekday?: Weekday;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  reason!: string;
}

export class SchoolCalendarRangeQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

export class WorkingDaysQueryDto extends SchoolCalendarRangeQueryDto {
  @IsUUID()
  sectionId!: string;
}
