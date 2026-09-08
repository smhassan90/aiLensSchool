import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeeFrequency, PaymentMethod } from '@prisma/client';

export class CreateFeeStructureDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({ enum: FeeFrequency })
  @IsOptional()
  @IsEnum(FeeFrequency)
  frequency?: FeeFrequency;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'When set, this fee belongs to that class only' })
  @IsOptional()
  @IsString()
  gradeId?: string;
}

export class AssignFeesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  feeStructureId?: string;

  @ApiProperty()
  @IsString()
  academicYearId!: string;

  @ApiProperty()
  @IsString()
  periodLabel!: string;

  @ApiProperty()
  @IsDateString()
  dueDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sectionId?: string;

  @ApiPropertyOptional({
    description: 'Bill every student enrolled in classes under this school section (stage)',
  })
  @IsOptional()
  @IsString()
  stageId?: string;

  @ApiPropertyOptional({ description: 'Bill students in this class only' })
  @IsOptional()
  @IsString()
  gradeId?: string;

  @ApiPropertyOptional({
    description: 'Fee bracket amount (e.g. 5500). Applied to every class in the selected stage/class, then billed.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount?: number;

  @ApiPropertyOptional({
    description: 'When true with stageId, bill each student using their class monthly tuition',
  })
  @IsOptional()
  @IsBoolean()
  useClassTuition?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  studentIds?: string[];
}

export class RecordPaymentDto {
  @ApiProperty()
  @IsString()
  studentFeeId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CollectFeeDto {
  @ApiProperty()
  @IsString()
  studentId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  studentFeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  feeStructureId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  periodLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  billedAmount?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  collectedAmount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class MarkPaidDto {
  @ApiProperty()
  @IsString()
  studentFeeId!: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
