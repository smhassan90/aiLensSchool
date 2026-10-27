import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RoleName, PlannerVersionStatus } from '@prisma/client';
import { PlannerApprovalService } from './planner-approval.service';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { PlannerAccessService } from './planner-access.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notifications.service';
import { AcademicPlannersService } from './academic-planners.service';
import { PlannerRecoveryService } from './planner-recovery.service';
import { AuthUser } from '../common/types/auth-user.type';

const principal: AuthUser = {
  id: 'principal-1',
  email: 'p@school.com',
  firstName: 'P',
  lastName: 'R',
  schoolId: 'school-1',
  roles: [RoleName.PRINCIPAL],
};

describe('PlannerApprovalService', () => {
  let service: PlannerApprovalService;
  const access = {
    resolveActor: jest.fn(),
    assertCanSubmit: jest.fn(),
    assertCanDecide: jest.fn(),
    assertCanPublishDirect: jest.fn(),
  };
  const planners = { getVersionPayload: jest.fn() };
  const prismaMock = {
    academicPlannerVersion: { findFirst: jest.fn() },
    academicPlanner: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlannerApprovalService,
        { provide: PrismaService, useValue: prismaMock },
        TenantService,
        { provide: PlannerAccessService, useValue: access },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: NotificationService, useValue: { createForUsers: jest.fn() } },
        { provide: AcademicPlannersService, useValue: planners },
        {
          provide: PlannerRecoveryService,
          useValue: { assertRecoverySubmitReady: jest.fn(), assertRecoveryApproveReady: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(PlannerApprovalService);
  });

  it('requires a comment to reject', async () => {
    await expect(
      service.reject(principal, 'planner-1', 'version-1', 1, '  '),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires comment to reject', async () => {
    await expect(
      service.reject(principal, 'p', 'v', 1, 'x'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forbids self-approval on submitted version', async () => {
    access.resolveActor.mockResolvedValue({
      userId: principal.id,
      schoolId: 'school-1',
      isPrincipalOrAdmin: true,
      isTeacher: false,
      isHeadTeacher: false,
      teacherProfileId: null,
    });
    access.assertCanDecide.mockImplementation(() => undefined);
    prismaMock.academicPlanner.findFirst.mockResolvedValue({
      id: 'planner-1',
      schoolId: 'school-1',
      createdById: 'teacher-user',
      teacherId: 'tp-1',
      lockRevision: 1,
      teacher: { userId: 'teacher-user' },
    });
    prismaMock.academicPlannerVersion.findFirst.mockResolvedValue({
      id: 'version-1',
      status: PlannerVersionStatus.SUBMITTED,
      revision: 2,
      submittedById: principal.id,
      summary: { feasibility: 'FEASIBLE' },
    });

    await expect(
      service.approve(principal, 'planner-1', 'version-1', 2),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
