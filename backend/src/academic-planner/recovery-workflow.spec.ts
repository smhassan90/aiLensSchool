import { PlannerVersionOrigin, PlannerVersionStatus } from '@prisma/client';
import {
  assertRecoveryBaselineCurrent,
  recoveryRequiresRegeneration,
} from './recovery-workflow';

describe('recovery workflow guards', () => {
  it('detects stale baseline', () => {
    expect(assertRecoveryBaselineCurrent('v-old', 'v-new')).toBe(false);
    expect(recoveryRequiresRegeneration(PlannerVersionOrigin.RECOVERY, 'v-old', 'v-new')).toBe(true);
  });

  it('allows current baseline', () => {
    expect(assertRecoveryBaselineCurrent('v1', 'v1')).toBe(true);
    expect(recoveryRequiresRegeneration(PlannerVersionOrigin.RECOVERY, 'v1', 'v1')).toBe(false);
  });

  it('ignores non-recovery origins', () => {
    expect(recoveryRequiresRegeneration(PlannerVersionOrigin.INITIAL, 'v-old', 'v-new')).toBe(false);
  });
});
