import { ScheduleChangeReason } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRecoveryProposalDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  lessonKeys!: string[];

  @IsEnum(ScheduleChangeReason)
  reason!: ScheduleChangeReason;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reasonNote?: string;

  @IsOptional()
  @IsBoolean()
  allowBufferUse?: boolean;

  @IsOptional()
  @IsBoolean()
  allowActivityRemoval?: boolean;

  @IsOptional()
  @IsBoolean()
  allowCompression?: boolean;

  @IsOptional()
  @IsBoolean()
  includeUnreported?: boolean;
}

export class RegenerateRecoveryProposalDto extends CreateRecoveryProposalDto {
  @IsInt()
  @Min(0)
  expectedRevision!: number;
}
