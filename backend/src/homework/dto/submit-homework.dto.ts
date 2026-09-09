import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitHomeworkAnswerDto {
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

export class SubmitHomeworkDto {
  @ApiProperty()
  @IsString()
  studentId!: string;

  @ApiProperty({ type: [SubmitHomeworkAnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitHomeworkAnswerDto)
  answers!: SubmitHomeworkAnswerDto[];
}
