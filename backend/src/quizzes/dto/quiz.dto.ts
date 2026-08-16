import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionType } from '@prisma/client';

export class GenerateQuizDto {
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

  @ApiPropertyOptional({ type: [String], description: 'Homework IDs whose titles are the quiz topics' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  homeworkIds?: string[];

  @ApiPropertyOptional()
  @ValidateIf((dto: GenerateQuizDto) => !dto.homeworkIds?.length)
  @IsDateString()
  lessonDateFrom?: string;

  @ApiPropertyOptional()
  @ValidateIf((dto: GenerateQuizDto) => !dto.homeworkIds?.length)
  @IsDateString()
  lessonDateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  questionCount?: number;

  @ApiPropertyOptional({ description: 'Let AI choose the mix of question types' })
  @IsOptional()
  @IsBoolean()
  quickGenerate?: boolean;

  @ApiPropertyOptional({ description: 'Choose-the-best-answer (MCQ) count' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  mcqCount?: number;

  @ApiPropertyOptional({ description: 'Fill-in-the-blank count' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  fillBlankCount?: number;

  @ApiPropertyOptional({ description: 'Simple text / short-answer count' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  shortAnswerCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;
}

class UpdateQuestionDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  included?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  questionText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  marks?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  correctAnswer?: string;

  @ApiPropertyOptional({ enum: QuestionType })
  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;
}

export class UpdateQuizQuestionsDto {
  @ApiProperty({ type: [UpdateQuestionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateQuestionDto)
  questions!: UpdateQuestionDto[];

  @ApiPropertyOptional({ description: 'Draft quiz name' })
  @IsOptional()
  @IsString()
  title?: string;
}

export class PublishQuizDto {
  @ApiPropertyOptional({ description: 'Publish now with no due date' })
  @IsOptional()
  @IsBoolean()
  immediate?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class QuizAnswerInputDto {
  @ApiProperty()
  @IsString()
  questionId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  optionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  answerText?: string;
}

export class SubmitQuizDto {
  @ApiProperty()
  @IsString()
  studentId!: string;

  @ApiProperty({ type: [QuizAnswerInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizAnswerInputDto)
  answers!: QuizAnswerInputDto[];
}
