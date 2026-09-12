"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { PageLoader } from "@/components/layout/page-loader";
import { feesService } from "@/services/fees.service";
import { academicsService } from "@/services/academics.service";
import { formatPkr } from "@/lib/money";
import { personFullName, studentMatchesQuery } from "@/lib/person-name";
import { formatDateTime } from "@/lib/utils";
import type { StudentFee } from "@/lib/types";
import { Wallet } from "lucide-react";

function classLabel(section?: { name: string; grade?: { name: string } | null } | null) {
  if (!section) return "—";
  return `${section.grade?.name ?? ""} ${section.name}`.trim() || "—";
}

function studentLabel(student?: { firstName: string; lastName: string; studentCode: string } | null) {
  if (!student) return "—";
  return `${personFullName(student.firstName, student.lastName)} · ${student.studentCode}`;
}

function statusBadge(status: string) {
  if (status === "PARTIAL") return <Badge variant="warning">Partial</Badge>;
  if (status === "PAID") return <Badge variant="success">Paid</Badge>;
  return <Badge variant="destructive">Unpaid</Badge>;
}

export function FeeMonthViews({
  view,
  sectionId,
  onSectionChange,
  collectHref,
}: {
  view: "collected" | "due";
  sectionId: string;
  onSectionChange: (sectionId: string) => void;
  collectHref: (studentId: string) => string;
}) {
  const [search, setSearch] = useState("");

  const sections = useQuery({
    queryKey: ["sections"],
    queryFn: () => academicsService.listSections({ limit: 100 }),
  });

  const collected = useQuery({
    queryKey: ["fee-collections", sectionId],
    queryFn: () =>
      feesService.listCollectionsThisMonth({
        limit: 100,
        sectionId: sectionId || undefined,
      }),
    enabled: view === "collected",
    staleTime: 5 * 60 * 1000,
  });

  const due = useQuery({
    queryKey: ["fees-due-month", sectionId],
    queryFn: () =>
      feesService.listDueThisMonth({
        limit: 100,
        sectionId: sectionId || undefined,
      }),
    enabled: view === "due",
    staleTime: 5 * 60 * 1000,
  });

  const monthLabel = view === "collected" ? collected.data?.monthLabel : due.data?.monthLabel;
  const q = search.trim();
  const unpaidItems = useMemo(() => {
    const rows = due.data?.unpaid ?? [];
    return q ? rows.filter((fee) => fee.student && studentMatchesQuery(fee.student, q)) : rows;
  }, [due.data?.unpaid, q]);
  const partialItems = useMemo(() => {
    const rows = due.data?.partial ?? [];
    return q ? rows.filter((fee) => fee.student && studentMatchesQuery(fee.student, q)) : rows;
  }, [due.data?.partial, q]);
  const collectedItems = useMemo(() => {
    const rows = collected.data?.items ?? [];
    if (!q) return rows;
    return rows.filter((row) => row.studentFee.student && studentMatchesQuery(row.studentFee.student, q));
  }, [collected.data?.items, q]);

  const hasFilters = Boolean(q || sectionId);

  const dueTotal = useMemo(() => {
    return [...unpaidItems, ...partialItems].reduce((sum, row) => sum + Number(row.balance ?? 0), 0);
  }, [unpaidItems, partialItems]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Label htmlFor="fee-month-search">Search</Label>
          <Input
            id="fee-month-search"
            placeholder="Student name, code, parent, or receipt"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="fee-month-class">Class / section</Label>
          <Select id="fee-month-class" value={sectionId} onChange={(e) => onSectionChange(e.target.value)}>
            <option value="">All classes</option>
            {(sections.data?.items ?? []).map((section) => (
              <option key={section.id} value={section.id}>
                {section.grade?.name} {section.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-end">
          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearch("");
                onSectionChange("");
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      {view === "due" && due.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(due.error as Error).message || "Could not load dues for this month."}
        </div>
      ) : view === "collected" ? (
        <CollectedTable
          loading={collected.isLoading}
          items={collectedItems}
          total={collectedItems.length}
          totalAmount={collectedItems.reduce((sum, row) => sum + Number(row.amount ?? 0), 0)}
          monthLabel={monthLabel}
          hasFilters={hasFilters}
          collectHref={collectHref}
        />
      ) : (
        <DueTables
          loading={due.isLoading}
          unpaid={unpaidItems}
          unpaidTotal={unpaidItems.length}
          partial={partialItems}
          partialTotal={partialItems.length}
          dueTotal={dueTotal}
          monthLabel={monthLabel}
          hasFilters={hasFilters}
          collectHref={collectHref}
        />
      )}
    </div>
  );
}

function CollectedTable({
  loading,
  items,
  total,
  totalAmount,
  monthLabel,
  hasFilters,
  collectHref,
}: {
  loading: boolean;
  items: Array<{
    id: string;
    amount: number;
    receiptNumber: string | null;
    method: string;
    paidAt: string;
    studentFee: {
      student: { id: string; firstName: string; lastName: string; studentCode: string };
      periodLabel: string;
      section?: { name: string; grade?: { name: string } | null } | null;
      feeStructure?: { name: string } | null;
    };
  }>;
  total: number;
  totalAmount: number;
  monthLabel?: string;
  hasFilters: boolean;
  collectHref: (studentId: string) => string;
}) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 text-sm">
        <p>
          {monthLabel ?? "This month"} · {total} payment{total === 1 ? "" : "s"} · newest first
        </p>
        <p className="font-medium">{formatPkr(totalAmount)}</p>
      </div>
      {loading ? (
        <PageLoader variant="panel" />
      ) : !items.length ? (
        <EmptyState
          icon={<Wallet className="h-10 w-10" />}
          title={hasFilters ? "No payments match" : "No collections yet this month"}
          description={
            hasFilters
              ? "Try another student or class, or clear the filters."
              : "Payments taken at the counter appear here, newest first."
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Bill</TableHead>
              <TableHead>Receipt</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-sm">{formatDateTime(row.paidAt)}</TableCell>
                <TableCell className="font-medium">
                  <Link href={`/school/students/${row.studentFee.student.id}`} className="hover:underline">
                    {studentLabel(row.studentFee.student)}
                  </Link>
                </TableCell>
                <TableCell>{classLabel(row.studentFee.section)}</TableCell>
                <TableCell className="text-sm">
                  {row.studentFee.feeStructure?.name ?? "Fee"} · {row.studentFee.periodLabel}
                </TableCell>
                <TableCell className="text-sm">
                  {row.receiptNumber ?? "—"}
                  <span className="block text-xs text-muted-foreground">{row.method}</span>
                </TableCell>
                <TableCell className="text-right font-medium">{formatPkr(row.amount)}</TableCell>
                <TableCell>
                  <Link href={collectHref(row.studentFee.student.id)}>
                    <Button size="sm" variant="outline">
                      Collect
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function DueTables({
  loading,
  unpaid,
  unpaidTotal,
  partial,
  partialTotal,
  dueTotal,
  monthLabel,
  hasFilters,
  collectHref,
}: {
  loading: boolean;
  unpaid: StudentFee[];
  unpaidTotal: number;
  partial: StudentFee[];
  partialTotal: number;
  dueTotal: number;
  monthLabel?: string;
  hasFilters: boolean;
  collectHref: (studentId: string) => string;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border bg-card">
        <PageLoader variant="panel" />
      </div>
    );
  }

  if (!unpaid.length && !partial.length) {
    return (
      <EmptyState
        icon={<Wallet className="h-10 w-10" />}
        title={hasFilters ? "No matching dues" : "Everyone is paid up this month"}
        description={
          hasFilters
            ? "Try another student or class, or clear the filters."
            : "Unpaid bills appear first, then partial payments."
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {monthLabel ?? "This month"} · unpaid {unpaidTotal}, partial {partialTotal} · still due {formatPkr(dueTotal)}
      </p>
      <DueGroup
        title="Not paid this month"
        empty="No fully unpaid bills."
        items={unpaid}
        collectHref={collectHref}
      />
      <DueGroup
        title="Partially paid"
        empty="No partial payments this month."
        items={partial}
        collectHref={collectHref}
      />
    </div>
  );
}

function DueGroup({
  title,
  empty,
  items,
  collectHref,
}: {
  title: string;
  empty: string;
  items: StudentFee[];
  collectHref: (studentId: string) => string;
}) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3 text-sm font-medium">{title}</div>
      {!items.length ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Bill</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Billed</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  {row.student ? (
                    <Link href={`/school/students/${row.student.id}`} className="hover:underline">
                      {studentLabel(row.student)}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>{classLabel(row.section)}</TableCell>
                <TableCell className="text-sm">
                  {row.feeStructure?.name ?? row.name ?? "Fee"} · {row.periodLabel}
                </TableCell>
                <TableCell>{statusBadge(row.status)}</TableCell>
                <TableCell className="text-right">{formatPkr(row.amount)}</TableCell>
                <TableCell className="text-right">{formatPkr(row.paidAmount)}</TableCell>
                <TableCell className="text-right font-medium">{formatPkr(row.balance)}</TableCell>
                <TableCell>
                  {row.student ? (
                    <Link href={collectHref(row.student.id)}>
                      <Button size="sm">Collect</Button>
                    </Link>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
