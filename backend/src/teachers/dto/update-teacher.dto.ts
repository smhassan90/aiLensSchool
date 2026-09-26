import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { emptyStringToUndefined } from '../../common/dto/transforms';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, TeacherStatus } from '@prisma/client';

export class UpdateTeacherDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender | null;

  @ApiPropertyOptional()
  @Transform(emptyStringToUndefined)
  @IsOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
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
}
