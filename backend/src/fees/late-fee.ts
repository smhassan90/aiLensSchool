export function clampFeeDueDay(day: number | null | undefined) {
  const n = Math.round(Number(day));
  if (!Number.isFinite(n)) return 10;
  return Math.min(28, Math.max(1, n));
}

export function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

export function isFeeOverdue(dueDate: Date | string | null | undefined, at = new Date()) {
  if (!dueDate) return false;
  const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  if (Number.isNaN(due.getTime())) return false;
  const lateFrom = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate() + 1));
  return at.getTime() >= lateFrom.getTime();
}

export function dueDateForMonth(feeDueDay: number, at = new Date()) {
  const day = clampFeeDueDay(feeDueDay);
  return new Date(Date.UTC(at.getFullYear(), at.getMonth(), day));
}

export function parsePeriodMonth(periodLabel: string, fallback = new Date()) {
  const parsed = Date.parse(`${periodLabel.trim()} 1`);
  if (Number.isNaN(parsed)) return fallback;
  return new Date(parsed);
}

export function lateFeeProposal(input: {
  dueDate?: Date | string | null;
  lateFeeCharged?: number | null;
  lateFeeWaived?: boolean | null;
  policyAmount?: number | null;
  at?: Date;
}) {
  const charged = Number(input.lateFeeCharged ?? 0);
  const policy = Math.max(0, Number(input.policyAmount ?? 0));
  const overdue = isFeeOverdue(input.dueDate, input.at);
  if (input.lateFeeWaived) {
    return { overdue, amount: 0, waived: true, charged: charged > 0.009 };
  }
  if (charged > 0.009) {
    return { overdue: overdue || true, amount: 0, waived: false, charged: true };
  }
  return {
    overdue,
    amount: overdue && policy > 0.009 ? roundMoney(policy) : 0,
    waived: false,
    charged: false,
  };
}
