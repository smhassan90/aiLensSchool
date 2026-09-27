import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';

export class PurgePlatformDataDto {
  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsBoolean()
  confirm!: boolean;
}
