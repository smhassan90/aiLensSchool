import { PlannerVersionOrigin, PlannerVersionStatus } from '@prisma/client';
import { PlannerAccessService } from './planner-access.service';

describe('Planner recovery permissions', () => {
  const access = new PlannerAccessService({} as never, {} as never);

  const actor = {
    userId: 'teacher-1',
    schoolId: 's1',
    isTeacher: true,
    isPrincipalOrAdmin: false,
    isHeadTeacher: false,
    teacherProfileId: 'tp-1',
  };

  const planner = { createdById: 'teacher-1', teacherId: 'tp-1', approvedVersionId: 'v-approved' };

  it('allows teacher to request recovery on approved version only', () => {
    const perms = access.computePermissions(actor, planner, {
      id: 'v-approved',
      status: PlannerVersionStatus.APPROVED,
      createdById: 'teacher-1',
      submittedById: null,
      summary: { feasibility: 'FEASIBLE' },
      origin: PlannerVersionOrigin.INITIAL,
    });
    expect(perms.canRequestRecovery).toBe(true);
    expect(perms.canDecide).toBe(false);
  });

  it('forbids teacher from deciding on own submission', () => {
    const principal = { ...actor, userId: 'p-1', isPrincipalOrAdmin: true, teacherProfileId: null };
    const perms = access.computePermissions(principal, planner, {
      id: 'v-rec',
      status: PlannerVersionStatus.SUBMITTED,
      createdById: 'teacher-1',
      submittedById: 'p-1',
      summary: { feasibility: 'FEASIBLE' },
      origin: PlannerVersionOrigin.RECOVERY,
    });
    expect(perms.canDecide).toBe(false);
  });

  it('allows regenerate on editable recovery draft with summary', () => {
    const perms = access.computePermissions(actor, planner, {
      id: 'v-rec',
      status: PlannerVersionStatus.DRAFT,
      createdById: 'teacher-1',
      submittedById: null,
      summary: { feasibility: 'FEASIBLE' },
      origin: PlannerVersionOrigin.RECOVERY,
    });
    expect(perms.canRegenerateRecovery).toBe(true);
  });
});
