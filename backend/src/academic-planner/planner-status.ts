import { PlannerStatus, PlannerVersionStatus } from '@prisma/client';

export type VersionAction =
  | 'submit'
  | 'withdraw'
  | 'approve'
  | 'reject'
  | 'request-changes'
  | 'publish-direct';

const VERSION_TRANSITIONS: Record<PlannerVersionStatus, Partial<Record<VersionAction, PlannerVersionStatus>>> = {
  DRAFT: {
    submit: PlannerVersionStatus.SUBMITTED,
    'publish-direct': PlannerVersionStatus.APPROVED,
  },
  CHANGES_REQUESTED: {
    submit: PlannerVersionStatus.SUBMITTED,
  },
  SUBMITTED: {
    withdraw: PlannerVersionStatus.DRAFT,
    approve: PlannerVersionStatus.APPROVED,
    reject: PlannerVersionStatus.REJECTED,
    'request-changes': PlannerVersionStatus.CHANGES_REQUESTED,
  },
  REJECTED: {},
  APPROVED: {},
  SUPERSEDED: {},
  WITHDRAWN: {},
};

export function isVersionEditable(status: PlannerVersionStatus): boolean {
  return status === PlannerVersionStatus.DRAFT || status === PlannerVersionStatus.CHANGES_REQUESTED;
}

export function canTransitionVersion(
  from: PlannerVersionStatus,
  action: VersionAction,
): { allowed: boolean; to?: PlannerVersionStatus } {
  const to = VERSION_TRANSITIONS[from]?.[action];
  if (!to) return { allowed: false };
  return { allowed: true, to };
}

export function derivePlannerStatus(input: {
  approvedVersionId: string | null;
  workingVersionStatus: PlannerVersionStatus | null;
  completedAt: Date | null;
  archivedAt: Date | null;
}): PlannerStatus {
  if (input.archivedAt) return PlannerStatus.ARCHIVED;
  if (input.completedAt) return PlannerStatus.COMPLETED;
  if (!input.approvedVersionId) {
    switch (input.workingVersionStatus) {
      case PlannerVersionStatus.SUBMITTED:
        return PlannerStatus.SUBMITTED;
      case PlannerVersionStatus.CHANGES_REQUESTED:
        return PlannerStatus.CHANGES_REQUESTED;
      case PlannerVersionStatus.REJECTED:
        return PlannerStatus.REJECTED;
      default:
        return PlannerStatus.DRAFT;
    }
  }
  if (input.workingVersionStatus === PlannerVersionStatus.SUBMITTED) {
    return PlannerStatus.REVISION_PENDING;
  }
  return PlannerStatus.PUBLISHED;
}
