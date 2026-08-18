import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAcademicYearDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiProperty()
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}

export class CreateGradeDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  level!: number;

  @ApiPropertyOptional({
    description: 'Create a default section so single-section schools can start immediately',
  })
  @IsOptional()
  @IsBoolean()
  createDefaultSection?: boolean;

  @ApiPropertyOptional({ description: 'Required when createDefaultSection is true' })
  @ValidateIf((dto: CreateGradeDto) => Boolean(dto.createDefaultSection))
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ example: 'A' })
  @IsOptional()
  @IsString()
  defaultSectionName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  defaultSectionCapacity?: number;
}

export class CreateSectionDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiProperty()
  @IsString()
  gradeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classTeacherId?: string;
}

export class CreateSubjectDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gradeId?: string;
}

export class CreateEnrollmentDto {
  @ApiProperty()
  @IsString()
  studentId!: string;

  @ApiProperty()
  @IsString()
  academicYearId!: string;

  @ApiProperty()
  @IsString()
  gradeId!: string;

  @ApiProperty()
  @IsString()
  sectionId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  enrollmentDate?: string;
}

export class AssignClassSubjectDto {
  @ApiProperty()
  @IsString()
  sectionId!: string;

  @ApiProperty()
  @IsString()
  subjectId!: string;

  @ApiProperty()
  @IsString()
  academicYearId!: string;

  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teacherId?: string;

  @ApiPropertyOptional({ description: 'Optional assistant teacher for this class/subject' })
  @IsOptional()
  @IsString()
  assistantTeacherId?: string;
}
