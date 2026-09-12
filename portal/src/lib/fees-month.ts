import type { StudentFee } from "@/lib/types";

export function currentMonthLabel(at = new Date()) {
  return at.toLocaleString("en-US", { month: "long", year: "numeric" });
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
