import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, TeacherStatus } from '@prisma/client';

class ClassSubjectAssignmentDto {
  @ApiProperty()
  @IsString()
  sectionId!: string;

  @ApiProperty()
  @IsString()
  subjectId!: string;

  @ApiProperty()
  @IsString()
  academicYearId!: string;
}

class TeacherSubjectAssignmentDto {
  @ApiProperty()
  @IsString()
  subjectId!: string;

  @ApiProperty()
  @IsString()
  academicYearId!: string;
}

export class CreateTeacherDto {
  @ApiProperty()
  @IsString()
  firstName!: string;

  @ApiProperty()
  @IsString()
  lastName!: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiPropertyOptional({ description: 'Leave blank to auto-generate e.g. SCHOOLCODE-0001' })
  @IsOptional()
  @IsString()
  employeeCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @ApiPropertyOptional({ enum: TeacherStatus })
  @IsOptional()
  @IsEnum(TeacherStatus)
  status?: TeacherStatus;

  @ApiPropertyOptional({ type: [TeacherSubjectAssignmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeacherSubjectAssignmentDto)
  subjects?: TeacherSubjectAssignmentDto[];

  @ApiPropertyOptional({ type: [ClassSubjectAssignmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClassSubjectAssignmentDto)
  classSubjects?: ClassSubjectAssignmentDto[];
}
