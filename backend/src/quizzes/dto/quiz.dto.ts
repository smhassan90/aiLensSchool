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

  @ApiPropertyOptional({ type: [String], description: 'Confirmed lecture IDs to include in an exam paper' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lessonIds?: string[];

  @ApiPropertyOptional()
  @ValidateIf((dto: GenerateQuizDto) => !dto.homeworkIds?.length && !dto.lessonIds?.length)
  @IsDateString()
  lessonDateFrom?: string;

  @ApiPropertyOptional()
  @ValidateIf((dto: GenerateQuizDto) => !dto.homeworkIds?.length && !dto.lessonIds?.length)
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
  @Max(40)
  mcqCount?: number;

  @ApiPropertyOptional({ description: 'Fill-in-the-blank count (short exact answer, auto-marked)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(40)
  fillBlankCount?: number;

  @ApiPropertyOptional({ description: 'True/False count' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(40)
  trueFalseCount?: number;

  @ApiPropertyOptional({ description: 'Open-ended / short-answer count for printed exam papers' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(40)
  openEndedCount?: number;

  @ApiPropertyOptional({ description: 'Short-answer count for printed exam papers' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(40)
  shortAnswerCount?: number;

  @ApiPropertyOptional({ description: 'Long-answer count for printed exam papers' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(40)
  longAnswerCount?: number;

  @ApiPropertyOptional({ description: 'Total marks for the MCQ section' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(200)
  mcqMarks?: number;

  @ApiPropertyOptional({ description: 'Total marks for the true/false section' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(200)
  trueFalseMarks?: number;

  @ApiPropertyOptional({ description: 'Total marks for the fill-in-the-blank section' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(200)
  fillBlankMarks?: number;

  @ApiPropertyOptional({ description: 'Total marks for the open-ended section' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(200)
  openEndedMarks?: number;

  @ApiPropertyOptional({ description: 'Total marks for short-answer questions' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(200)
  shortAnswerMarks?: number;

  @ApiPropertyOptional({ description: 'Total marks for long-answer questions' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(200)
  longAnswerMarks?: number;

  @ApiPropertyOptional({ description: 'ASSESSMENT, MID_TERM, FINAL_TERM, or QUIZ' })
  @IsOptional()
  @IsString()
  paperKind?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Difficulty 1 (easiest) to 10 (hardest)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  difficulty?: number;

  @ApiPropertyOptional({ description: 'School exam paper from setup (1st Assessment, Mid term, etc.)' })
  @IsOptional()
  @IsString()
  examConfigId?: string;

  @ApiPropertyOptional({ description: 'Admin-assigned exam paper task (required for teachers)' })
  @IsOptional()
  @IsString()
  examPaperAssignmentId?: string;
}

export class RejectExamPaperDto {
  @ApiProperty()
  @IsString()
  reason!: string;
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

  @ApiPropertyOptional({ description: 'Display order (0-based)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number;
}

class QuizOptionInputDto {
  @ApiProperty()
  @IsString()
  optionText!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;
}

export class AddQuizQuestionDto {
  @ApiProperty({ enum: QuestionType })
  @IsEnum(QuestionType)
  type!: QuestionType;

  @ApiProperty()
  @IsString()
  questionText!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  marks!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  correctAnswer?: string;

  @ApiPropertyOptional({ type: [QuizOptionInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizOptionInputDto)
  options?: QuizOptionInputDto[];
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

export class SubmitExamPaperDto {
  @ApiPropertyOptional({ type: [UpdateQuestionDto], description: 'Final question list before submit' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateQuestionDto)
  questions?: UpdateQuestionDto[];
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
