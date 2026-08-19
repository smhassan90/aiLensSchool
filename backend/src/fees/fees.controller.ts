import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName, StudentFeeStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { FeesService } from './fees.service';
import { AssignFeesDto, CreateFeeStructureDto, MarkPaidDto, RecordPaymentDto } from './dto/fees.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto } from '../common/dto/pagination.dto';

class FeeListQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(StudentFeeStatus)
  status?: StudentFeeStatus;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  sectionId?: string;
}

@ApiTags('Fees')
@ApiBearerAuth()
@Controller({ path: 'fees', version: '1' })
export class FeesController {
  constructor(private readonly feesService: FeesService) {}

  @Roles(RoleName.SCHOOL_ADMIN)
  @Post('structures')
  createStructure(@Body() dto: CreateFeeStructureDto, @CurrentUser() user: AuthUser) {
    return this.feesService.createStructure(dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER)
  @Get('structures')
  listStructures(@Query() query: PaginationDto, @CurrentUser() user: AuthUser) {
    return this.feesService.listStructures(user, query);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @Post('assign')
  assign(@Body() dto: AssignFeesDto, @CurrentUser() user: AuthUser) {
    return this.feesService.assign(dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER, RoleName.PARENT)
  @Get()
  list(@Query() query: FeeListQueryDto, @CurrentUser() user: AuthUser) {
    return this.feesService.listStudentFees(user, query);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @Post('payments')
  pay(@Body() dto: RecordPaymentDto, @CurrentUser() user: AuthUser) {
    return this.feesService.recordPayment(dto, user);
  }

  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @Post('mark-paid')
  markPaid(@Body() dto: MarkPaidDto, @CurrentUser() user: AuthUser) {
    return this.feesService.markPaid(dto, user);
  }
}
