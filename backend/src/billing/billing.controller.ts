import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { BillingService } from './billing.service';
import {
  CreatePricingPlanDto,
  GenerateInvoiceDto,
  UpdatePricingPlanDto,
} from './dto/billing.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto } from '../common/dto/pagination.dto';

class InvoiceQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  schoolId?: string;
}

@ApiTags('Billing')
@ApiBearerAuth()
@Controller({ path: 'billing', version: '1' })
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Roles(RoleName.SUPER_ADMIN)
  @Post('plans')
  createPlan(@Body() dto: CreatePricingPlanDto, @CurrentUser() user: AuthUser) {
    return this.billingService.createPlan(dto, user);
  }

  @Roles(RoleName.SUPER_ADMIN)
  @Get('plans')
  listPlans(@Query() query: PaginationDto) {
    return this.billingService.listPlans(query);
  }

  @Roles(RoleName.SUPER_ADMIN)
  @Patch('plans/:id')
  updatePlan(
    @Param('id') id: string,
    @Body() dto: UpdatePricingPlanDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.billingService.updatePlan(id, dto, user);
  }

  @Roles(RoleName.SUPER_ADMIN)
  @Get('preview/:schoolId')
  preview(@Param('schoolId') schoolId: string) {
    return this.billingService.preview(schoolId);
  }

  @Roles(RoleName.SUPER_ADMIN)
  @Post('invoices')
  generateInvoice(@Body() dto: GenerateInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.billingService.generateInvoice(dto, user);
  }

  @Roles(RoleName.SUPER_ADMIN)
  @Get('invoices')
  listInvoices(@Query() query: InvoiceQueryDto) {
    return this.billingService.listInvoices(query);
  }
}
