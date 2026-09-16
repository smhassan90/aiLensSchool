import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';

const TIME_HM = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

export class CheckInTeacherDto {
  @ApiProperty()
  @IsString()
  teacherId!: string;

  @ApiPropertyOptional({ description: 'ISO timestamp. Defaults to now.' })
  @IsOptional()
  @IsDateString()
  checkedInAt?: string;
}

export class SyncTeacherAttendanceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teacherId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeCode?: string;

  @ApiProperty({ description: 'Punch time from the attendance machine' })
  @IsDateString()
  checkedInAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalId?: string;
}

export class UpdateTeacherAttendancePolicyDto {
  @ApiProperty({ example: '08:15' })
  @Matches(TIME_HM, { message: 'Late after must be HH:mm' })
  teacherLateAfter!: string;

  @ApiProperty({ example: '09:00' })
  @Matches(TIME_HM, { message: 'Absent after must be HH:mm' })
  teacherAbsentAfter!: string;
}
