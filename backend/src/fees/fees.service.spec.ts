import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RoleName, StudentFeeStatus } from '@prisma/client';
import { FeesService } from './fees.service';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { ParentsService } from '../parents/parents.service';
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
      feeStructure: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), upsert: jest.fn() },
      academicYear: { findFirst: jest.fn() },
      schoolStage: { findFirst: jest.fn() },
      grade: { findMany: jest.fn(), update: jest.fn() },
      studentEnrollment: { findMany: jest.fn() },
      section: { findMany: jest.fn() },
      student: { findMany: jest.fn(), findFirst: jest.fn() },
      school: { findUnique: jest.fn() },
      studentFee: {
        upsert: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      feePayment: { create: jest.fn(), findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: ParentsService, useValue: { assertParentOwnsStudent: jest.fn() } },
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
    prisma.studentEnrollment = { findMany: jest.fn().mockResolvedValue([]) };
    await expect(
      service.assign(
        {
          feeStructureId: 'fs-1',
          academicYearId: 'year-1',
          periodLabel: 'August 2026',
          dueDate: '2026-08-10',
          sectionId: 'sec-1',
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

  it('collects cash, keeps a balance, and writes a receipt', async () => {
    prisma.student.findFirst.mockResolvedValue({
      id: 'st-1',
      schoolId: 'school-1',
      branchId: 'b1',
      firstName: 'Ali',
      lastName: 'Khan',
      studentCode: 'S1',
      admissionNumber: 'A1',
      enrollments: [
        {
          sectionId: 'sec-1',
          academicYear: { id: 'year-1', name: '2026-27' },
          grade: { name: 'Class 1', tuitionFee: 8000 },
          section: { name: 'A' },
        },
      ],
      parents: [
        {
          relationship: 'FATHER',
          parent: { phone: '03001234567', user: { firstName: 'Ahmed', lastName: 'Khan', phone: null } },
        },
      ],
    });
    prisma.studentFee.findFirst.mockResolvedValue({
      id: 'fee-1',
      amount: 8000,
      paidAmount: 0,
      discountAmount: 0,
      periodLabel: 'September 2026',
      feeStructure: { name: 'Class 1 monthly tuition' },
    });
    prisma.school.findUnique.mockResolvedValue({
      name: 'The Piercing Stars',
      address: 'Karachi',
      phone: '0315',
      code: 'TPS',
    });
    prisma.feePayment.findFirst.mockResolvedValue(null);
    prisma.feePayment.create.mockResolvedValue({
      id: 'p1',
      amount: 5000,
      discountAmount: 1000,
      receiptNumber: 'TPS-202609-0001',
      method: 'CASH',
      notes: null,
      paidAt: new Date('2026-09-06'),
      recordedBy: { firstName: 'School', lastName: 'Admin' },
    });
    prisma.studentFee.update.mockResolvedValue({});

    const receipt = await service.collect(
      { studentId: 'st-1', studentFeeId: 'fee-1', collectedAmount: 5000, discountAmount: 1000 },
      admin,
    );

    expect(receipt.collected).toBe(5000);
    expect(receipt.discount).toBe(1000);
    expect(receipt.balance).toBe(2000);
    expect(receipt.receiptNumber).toBe('TPS-202609-0001');
    expect(prisma.studentFee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paidAmount: 5000,
          discountAmount: 1000,
          status: StudentFeeStatus.PARTIAL,
        }),
      }),
    );
  });

  it('rejects collect when cash plus discount is more than due', async () => {
    prisma.student.findFirst.mockResolvedValue({
      id: 'st-1',
      schoolId: 'school-1',
      branchId: 'b1',
      firstName: 'Ali',
      lastName: 'Khan',
      studentCode: 'S1',
      admissionNumber: 'A1',
      enrollments: [
        {
          sectionId: 'sec-1',
          academicYear: { id: 'year-1', name: '2026-27' },
          grade: { name: 'Class 1', tuitionFee: 8000 },
          section: { name: 'A' },
        },
      ],
      parents: [],
    });
    prisma.studentFee.findFirst.mockResolvedValue({
      id: 'fee-1',
      amount: 8000,
      paidAmount: 0,
      discountAmount: 0,
      periodLabel: 'September 2026',
      feeStructure: { name: 'Tuition' },
    });

    await expect(
      service.collect(
        { studentId: 'st-1', studentFeeId: 'fee-1', collectedAmount: 7000, discountAmount: 2000 },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('summarises this month’s paid and due students for a class', async () => {
    prisma.section.findMany.mockResolvedValue([{ id: 'sec-1', name: 'A' }]);
    prisma.academicYear.findFirst.mockResolvedValue({ id: 'year-1' });
    prisma.studentEnrollment.findMany.mockResolvedValue([
      {
        studentId: 'st-paid',
        section: { id: 'sec-1', name: 'A' },
        student: { id: 'st-paid', firstName: 'Ali', lastName: 'Khan', studentCode: 'S1' },
      },
      {
        studentId: 'st-due',
        section: { id: 'sec-1', name: 'A' },
        student: { id: 'st-due', firstName: 'Sara', lastName: 'Ahmed', studentCode: 'S2' },
      },
      {
        studentId: 'st-partial',
        section: { id: 'sec-1', name: 'A' },
        student: { id: 'st-partial', firstName: 'Omar', lastName: 'Raza', studentCode: 'S3' },
      },
    ]);
    prisma.studentFee.findMany.mockResolvedValue([
      { studentId: 'st-paid', amount: 5000, paidAmount: 5000, discountAmount: 0, status: StudentFeeStatus.PAID },
      { studentId: 'st-due', amount: 5000, paidAmount: 0, discountAmount: 0, status: StudentFeeStatus.DUE },
      { studentId: 'st-partial', amount: 5000, paidAmount: 2000, discountAmount: 0, status: StudentFeeStatus.PARTIAL },
    ]);

    const result = await service.classMonthStatus(admin, { gradeId: 'grade-1' });

    expect(result.students).toBe(3);
    expect(result.paidStudents).toBe(1);
    expect(result.dueStudents).toBe(1);
    expect(result.partialStudents).toBe(1);
    expect(result.receivedAmount).toBe(7000);
    expect(result.remainingAmount).toBe(8000);
  });
});
