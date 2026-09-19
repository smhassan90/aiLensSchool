import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class HeadTeacherAssignmentInputDto {
  @IsString()
  teacherId!: string;

  @IsString()
  title!: string;

  @IsArray()
  @IsString({ each: true })
  sectionIds!: string[];
}

export class SaveHeadTeacherBoardDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeadTeacherAssignmentInputDto)
  assignments!: HeadTeacherAssignmentInputDto[];
}

export class HeadTeacherListQueryDto {
  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  examConfigId?: string;

  @IsOptional()
  @IsString()
  q?: string;
}
