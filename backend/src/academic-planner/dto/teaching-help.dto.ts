import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
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

  /** 0 keeps the first activity. Higher numbers ask for a different activity format. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(12)
  variety?: number;
}
