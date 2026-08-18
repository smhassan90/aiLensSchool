import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ExpenseCategory, ExpenseRecurrence, RoleName } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ExpensesService } from './expenses.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermission } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';

class CreateExpenseDto {
  @IsString()
  title!: string;

  @IsEnum(ExpenseCategory)
  category!: ExpenseCategory;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsEnum(ExpenseRecurrence)
  recurrence?: ExpenseRecurrence;

  @IsDateString()
  expenseDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

@ApiTags('Expenses')
@ApiBearerAuth()
@Controller({ path: 'expenses', version: '1' })
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('VIEW_FINANCE')
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.expenses.list(user, from, to);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('MANAGE_EXPENSES')
  @Post()
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: AuthUser) {
    return this.expenses.create(user, dto);
  }

  @Roles(RoleName.SCHOOL_ADMIN)
  @RequirePermission('MANAGE_EXPENSES')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.expenses.remove(user, id);
  }
}
