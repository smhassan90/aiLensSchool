import type { StudentFee } from "@/lib/types";

export function currentMonthLabel(at = new Date()) {
  return at.toLocaleString("en-US", { month: "long", year: "numeric" });
}

export function monthPeriodOptions(start?: string | Date | null, end?: string | Date | null) {
  const now = new Date();
  const startDate = start ? new Date(start) : new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const endDate = end ? new Date(end) : new Date(now.getFullYear(), now.getMonth() + 9, 1);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return [currentMonthLabel(now)];
  }
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const last = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  if (last < cursor) return [currentMonthLabel(now)];
  const labels: string[] = [];
  while (cursor <= last && labels.length < 24) {
    labels.push(currentMonthLabel(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return labels.length ? labels : [currentMonthLabel(now)];
}

export function feeBelongsToThisMonth(
  fee: { dueDate?: string | Date | null; periodLabel?: string | null },
  at = new Date(),
) {
  if (fee.dueDate) {
    const due = typeof fee.dueDate === "string" ? new Date(fee.dueDate) : fee.dueDate;
    if (!Number.isNaN(due.getTime())) {
      if (due.getFullYear() === at.getFullYear() && due.getMonth() === at.getMonth()) return true;
      if (due.getUTCFullYear() === at.getFullYear() && due.getUTCMonth() === at.getMonth()) return true;
    }
  }
  const label = (fee.periodLabel ?? "").toLowerCase();
  if (!label) return false;
  const monthLong = at.toLocaleString("en-US", { month: "long" }).toLowerCase();
  const monthShort = at.toLocaleString("en-US", { month: "short" }).toLowerCase().replace(".", "");
  const year = String(at.getFullYear());
  return label.includes(year) && (label.includes(monthLong) || label.includes(monthShort));
}

export function feeIsStillDue(fee: Pick<StudentFee, "status" | "balance">) {
  if (fee.status === "PAID" || fee.status === "WAIVED") return false;
  return Number(fee.balance ?? 0) > 0.009;
}

export function dueDateIsoForPeriod(periodLabel: string, feeDueDay: number, at = new Date()) {
  const day = Math.min(28, Math.max(1, Math.round(Number(feeDueDay)) || 10));
  const parsed = Date.parse(`${periodLabel.trim()} 1`);
  const date = Number.isNaN(parsed) ? at : new Date(parsed);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${String(day).padStart(2, "0")}`;
}
