import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { TeachingAssistanceModeSchema } from '../../ai/schemas/teaching-help.schema';

const TEACHING_MODES = TeachingAssistanceModeSchema.options;

export class TeachingHelpRequestDto {
  @IsOptional()
  @IsString()
  versionId?: string;

  @IsOptional()
  @IsIn(TEACHING_MODES)
  mode?: (typeof TEACHING_MODES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  question?: string;
}
