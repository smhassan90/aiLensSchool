import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RoleName, StudentFeeStatus } from '@prisma/client';
import { FeesService } from './fees.service';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';

const admin: AuthUser = {
  id: 'u-admin',
  email: 'admin@abcschool.com',
  firstName: 'School',
  lastName: 'Admin',
  schoolId: 'school-1',
  roles: [RoleName.SCHOOL_ADMIN],
};

describe('FeesService', () => {
  let service: FeesService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(async (arg: unknown) => {
        if (Array.isArray(arg)) return Promise.all(arg);
        if (typeof arg === 'function') return arg(prisma);
        return arg;
      }),
      feeStructure: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      academicYear: { findFirst: jest.fn() },
      studentEnrollment: { findMany: jest.fn() },
      student: { findMany: jest.fn() },
      studentFee: {
        upsert: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      feePayment: { create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
        TenantService,
      ],
    }).compile();

    service = module.get(FeesService);
  });

  it('rejects overpayment', async () => {
    prisma.studentFee.findFirst.mockResolvedValue({
      id: 'fee-1',
      amount: 5000,
      paidAmount: 4000,
    });
    await expect(
      service.recordPayment({ studentFeeId: 'fee-1', amount: 1500 }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records a partial payment and marks paid when complete', async () => {
    prisma.studentFee.findFirst.mockResolvedValue({
      id: 'fee-1',
      amount: 5000,
      paidAmount: 2500,
    });
    prisma.feePayment.create.mockResolvedValue({ id: 'p1', amount: 2500 });
    prisma.studentFee.update.mockResolvedValue({});

    const result = await service.recordPayment({ studentFeeId: 'fee-1', amount: 2500 }, admin);
    expect(result.status).toBe(StudentFeeStatus.PAID);
    expect(prisma.studentFee.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: StudentFeeStatus.PAID }) }),
    );
  });

  it('requires students when assigning fees', async () => {
    prisma.feeStructure.findFirst.mockResolvedValue({ id: 'fs-1', amount: 1000 });
    prisma.academicYear.findFirst.mockResolvedValue({ id: 'year-1' });
    await expect(
      service.assign(
        {
          feeStructureId: 'fs-1',
          academicYearId: 'year-1',
          periodLabel: 'August 2026',
          dueDate: '2026-08-10',
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when fee record is missing', async () => {
    prisma.studentFee.findFirst.mockResolvedValue(null);
    await expect(
      service.recordPayment({ studentFeeId: 'missing', amount: 10 }, admin),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marks a due fee as paid for the remaining balance', async () => {
    prisma.studentFee.findFirst.mockResolvedValue({
      id: 'fee-1',
      amount: 5000,
      paidAmount: 1500,
      status: StudentFeeStatus.PARTIAL,
    });
    prisma.feePayment.create.mockResolvedValue({ id: 'p1', amount: 3500 });
    prisma.studentFee.update.mockResolvedValue({});

    const result = await service.markPaid({ studentFeeId: 'fee-1' }, admin);
    expect(result.status).toBe(StudentFeeStatus.PAID);
    expect(prisma.feePayment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 3500 }) }),
    );
  });
});
