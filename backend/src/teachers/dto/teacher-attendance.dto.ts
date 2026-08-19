import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDateString, IsIn, IsString, ValidateNested } from 'class-validator';

class TeacherAttendanceEntryDto {
  @ApiProperty()
  @IsString()
  teacherId!: string;

  @ApiProperty({ enum: ['PRESENT', 'ABSENT'] })
  @IsIn(['PRESENT', 'ABSENT'])
  status!: 'PRESENT' | 'ABSENT';
}

export class MarkTeacherAttendanceDto {
  @ApiProperty()
  @IsDateString()
  date!: string;

  @ApiProperty({ type: [TeacherAttendanceEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeacherAttendanceEntryDto)
  entries!: TeacherAttendanceEntryDto[];
}
