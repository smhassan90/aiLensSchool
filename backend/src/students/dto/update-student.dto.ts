import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateStudentDto {
  @ApiPropertyOptional({ enum: ['COMPUTER', 'BIOLOGY'] })
  @IsOptional()
  @IsString()
  scienceGroup?: string;
}
