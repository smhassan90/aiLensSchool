import { Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseCategory, ExpenseRecurrence } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly audit: AuditService,
  ) {}

  list(user: AuthUser, from?: string, to?: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    return this.prisma.expense.findMany({
      where: {
        schoolId,
        ...(from || to
          ? {
              expenseDate: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { expenseDate: 'desc' },
      take: 200,
    });
  }

  async create(
    user: AuthUser,
    dto: {
      title: string;
      category: ExpenseCategory;
      amount: number;
      recurrence?: ExpenseRecurrence;
      expenseDate: string;
      notes?: string;
    },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const expense = await this.prisma.expense.create({
      data: {
        schoolId,
        title: dto.title,
        category: dto.category,
        amount: dto.amount,
        recurrence: dto.recurrence ?? ExpenseRecurrence.ONE_TIME,
        expenseDate: new Date(dto.expenseDate),
        notes: dto.notes,
        recordedById: user.id,
      },
    });
    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'EXPENSE_CREATED',
      entityType: 'Expense',
      entityId: expense.id,
    });
    return expense;
  }

  async remove(user: AuthUser, id: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const existing = await this.prisma.expense.findFirst({ where: { id, schoolId } });
    if (!existing) {
      throw new NotFoundException({ code: 'EXPENSE_NOT_FOUND', message: 'Expense not found' });
    }
    await this.prisma.expense.delete({ where: { id } });
    return { deleted: true };
  }
}
