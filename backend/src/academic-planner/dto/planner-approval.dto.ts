import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class SubmitPlannerDto {
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @IsOptional()
  @IsBoolean()
  acknowledgeRisk?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class PlannerDecisionDto {
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  comment?: string;
}

export class PlannerCommentRequiredDto extends PlannerDecisionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  comment!: string;
}
