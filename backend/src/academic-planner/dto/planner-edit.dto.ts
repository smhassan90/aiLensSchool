import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class ExpectedRevisionDto {
  @IsInt()
  @Min(0)
  expectedRevision!: number;
}

export class AnalyzeChapterDto extends ExpectedRevisionDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class GenerateScheduleDto extends ExpectedRevisionDto {}
