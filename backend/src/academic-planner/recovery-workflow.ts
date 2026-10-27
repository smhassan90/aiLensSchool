import { PlannerVersionOrigin, PlannerVersionStatus } from '@prisma/client';
import { RecoveryImpact } from './recovery-impact';
import { RecoveryTimetableConflict } from './recovery-conflicts';

export function assertRecoveryVersionEditable(status: PlannerVersionStatus): void {
  if (status !== PlannerVersionStatus.DRAFT && status !== PlannerVersionStatus.CHANGES_REQUESTED) {
    throw new Error('RECOVERY_VERSION_NOT_EDITABLE');
  }
}

export function assertRecoveryBaselineCurrent(
  basedOnVersionId: string | null,
  approvedVersionId: string | null,
): boolean {
  if (!basedOnVersionId || !approvedVersionId) return false;
  return basedOnVersionId === approvedVersionId;
}

export function recoveryHasBlockingConflicts(impact: RecoveryImpact | null): boolean {
  return Boolean(impact?.timetableConflicts?.length);
}

export function recoveryRequiresRegeneration(
  origin: PlannerVersionOrigin,
  basedOnVersionId: string | null,
  approvedVersionId: string | null,
): boolean {
  if (origin !== PlannerVersionOrigin.RECOVERY) return false;
  return !assertRecoveryBaselineCurrent(basedOnVersionId, approvedVersionId);
}

export function mergeTimetableConflicts(
  existing: RecoveryTimetableConflict[],
  next: RecoveryTimetableConflict[],
): RecoveryTimetableConflict[] {
  const key = (c: RecoveryTimetableConflict) => `${c.code}|${c.message}|${c.date}|${c.periodNumber}`;
  const map = new Map<string, RecoveryTimetableConflict>();
  for (const c of [...existing, ...next]) {
    map.set(key(c), c);
  }
  return [...map.values()];
}
