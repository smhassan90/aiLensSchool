import { IsArray, IsDateString, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateHomeworkDto {
  @ApiProperty()
  @IsString()
  academicYearId!: string;

  @ApiProperty()
  @IsString()
  sectionId!: string;

  @ApiProperty()
  @IsString()
  subjectId!: string;

  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Teacher-only answer key. Never shown to parents or students.',
  })
  @IsOptional()
  @IsString()
  answerKey?: string;

  @ApiPropertyOptional({
    description: 'Auto-gradable homework questions JSON (teacher create/preview).',
  })
  @IsOptional()
  @IsArray()
  questionsJson?: unknown[];

  @ApiProperty()
  @IsDateString()
  dueDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lessonId?: string;
}
