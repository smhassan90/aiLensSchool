import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { emptyStringToUndefined } from '../../common/dto/transforms';
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

  /** Ignored on create; accepted so older clients sending a blank email do not fail validation. */
  @ApiPropertyOptional({ deprecated: true })
  @Transform(emptyStringToUndefined)
  @IsOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsEmail()
  email?: string;

  @ApiProperty({ description: 'Mobile number; used for login username and must be unique in the school' })
  @IsString()
  @MinLength(7)
  phone!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiPropertyOptional({ description: 'Leave blank to auto-generate e.g. SCHOOLCODE-0001' })
  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsString()
  employeeCode?: string;

  @ApiPropertyOptional()
  @Transform(emptyStringToUndefined)
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
