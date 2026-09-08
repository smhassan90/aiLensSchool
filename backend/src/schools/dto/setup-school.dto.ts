import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '@prisma/client';

export class SetupTeacherDto {
  @ApiProperty({ description: 'Client temp id used to assign this teacher later in setup' })
  @IsString()
  key!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  firstName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  phone!: string;
}

export class SetupStageDto {
  @ApiProperty({ description: 'Client temp id' })
  @IsString()
  key!: string;

  @ApiProperty({ example: 'Pre-Primary' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ description: 'Teacher key from the teachers list' })
  @IsOptional()
  @IsString()
  coordinatorKey?: string;
}

export class SetupClassSubjectDto {
  @ApiProperty({ example: 'English' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ description: 'Teacher key who teaches this subject in this class' })
  @IsOptional()
  @IsString()
  teacherKey?: string;
}

export class SetupClassDto {
  @ApiProperty({ example: 'Level 1' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ description: 'School section key this class belongs to' })
  @IsString()
  stageKey!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classTeacherKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  admissionFee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tuitionFee?: number;

  @ApiProperty({ type: [SetupClassSubjectDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SetupClassSubjectDto)
  subjects!: SetupClassSubjectDto[];
}

export class SetupExamDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxMarks!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sequence?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class SetupSchoolDto {
  @ApiProperty()
  @IsString()
  yearName!: string;

  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiProperty()
  @IsDateString()
  endDate!: string;

  @ApiProperty({ type: [SetupTeacherDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetupTeacherDto)
  teachers!: SetupTeacherDto[];

  @ApiProperty({ type: [SetupStageDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SetupStageDto)
  stages!: SetupStageDto[];

  @ApiProperty({ type: [SetupClassDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SetupClassDto)
  classes!: SetupClassDto[];

  @ApiPropertyOptional({ type: [SetupExamDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetupExamDto)
  exams?: SetupExamDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minQuizzes?: number;
}
