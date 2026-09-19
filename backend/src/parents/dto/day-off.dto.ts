import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDayOffDto {
  @IsString()
  studentId!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason!: string;
}

export class DayOffQueryDto {
  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}

export class ReviewDayOffDto {
  @IsString()
  status!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewNote?: string;
}
