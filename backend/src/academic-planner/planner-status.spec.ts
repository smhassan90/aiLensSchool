import { PlannerStatus, PlannerVersionStatus } from '@prisma/client';
import { canTransitionVersion, derivePlannerStatus, isVersionEditable } from './planner-status';

describe('planner-status', () => {
  it('allows edit only in draft or changes requested', () => {
    expect(isVersionEditable(PlannerVersionStatus.DRAFT)).toBe(true);
    expect(isVersionEditable(PlannerVersionStatus.CHANGES_REQUESTED)).toBe(true);
    expect(isVersionEditable(PlannerVersionStatus.SUBMITTED)).toBe(false);
  });

  it('enforces version transitions', () => {
    expect(canTransitionVersion(PlannerVersionStatus.DRAFT, 'submit').allowed).toBe(true);
    expect(canTransitionVersion(PlannerVersionStatus.SUBMITTED, 'approve').to).toBe(PlannerVersionStatus.APPROVED);
    expect(canTransitionVersion(PlannerVersionStatus.APPROVED, 'submit').allowed).toBe(false);
  });

  it('derives planner status from approved and working versions', () => {
    expect(
      derivePlannerStatus({
        approvedVersionId: null,
        workingVersionStatus: PlannerVersionStatus.SUBMITTED,
        completedAt: null,
        archivedAt: null,
      }),
    ).toBe(PlannerStatus.SUBMITTED);

    expect(
      derivePlannerStatus({
        approvedVersionId: 'v1',
        workingVersionStatus: PlannerVersionStatus.SUBMITTED,
        completedAt: null,
        archivedAt: null,
      }),
    ).toBe(PlannerStatus.REVISION_PENDING);

    expect(
      derivePlannerStatus({
        approvedVersionId: 'v1',
        workingVersionStatus: PlannerVersionStatus.DRAFT,
        completedAt: null,
        archivedAt: null,
      }),
    ).toBe(PlannerStatus.PUBLISHED);
  });
});
