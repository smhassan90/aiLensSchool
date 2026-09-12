"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageLoader } from "@/components/layout/page-loader";
import { feesService } from "@/services/fees.service";
import { formatPkr } from "@/lib/money";
import { personFullName, studentMatchesQuery } from "@/lib/person-name";
import type { ClassFeeStudent, Section } from "@/lib/types";
import { Wallet } from "lucide-react";

function statusBadge(status: ClassFeeStudent["status"]) {
  if (status === "PAID") return <Badge variant="success">Paid</Badge>;
  if (status === "PARTIAL") return <Badge variant="warning">Partial</Badge>;
  if (status === "UNBILLED") return <Badge variant="secondary">Not billed</Badge>;
  return <Badge variant="destructive">Unpaid</Badge>;
}

function StudentTable({
  rows,
  empty,
  showPay,
}: {
  rows: ClassFeeStudent[];
  empty: string;
  showPay?: boolean;
}) {
  if (!rows.length) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Student</TableHead>
          <TableHead>Section</TableHead>
          <TableHead>Billed</TableHead>
          <TableHead>Received</TableHead>
          <TableHead>Left</TableHead>
          <TableHead>Status</TableHead>
          {showPay ? <TableHead></TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.studentId}>
            <TableCell className="font-medium">
              {personFullName(row.firstName, row.lastName)}
              <span className="ml-2 text-xs text-muted-foreground">{row.studentCode}</span>
            </TableCell>
            <TableCell>{row.sectionName}</TableCell>
            <TableCell>{formatPkr(row.billed)}</TableCell>
            <TableCell>{formatPkr(row.paid)}</TableCell>
            <TableCell>{formatPkr(row.remaining)}</TableCell>
            <TableCell>{statusBadge(row.status)}</TableCell>
            {showPay ? (
              <TableCell>
                <Link href={`/school/fees?studentId=${row.studentId}`}>
                  <Button size="sm" variant="outline">
                    <Wallet className="h-4 w-4" />
                    Collect
                  </Button>
                </Link>
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ClassFeeStatus({
  gradeId,
  sections,
}: {
  gradeId: string;
  sections: Section[];
}) {
  const [sectionId, setSectionId] = useState("");
  const [search, setSearch] = useState("");

  const status = useQuery({
    queryKey: ["class-fee-status", gradeId],
    queryFn: () => feesService.classMonthStatus({ gradeId }),
    enabled: Boolean(gradeId),
  });

  const filtered = useMemo(() => {
    const q = search.trim();
    return (status.data?.items ?? []).filter((row) => {
      if (sectionId && row.sectionId !== sectionId) return false;
      if (!q) return true;
      return studentMatchesQuery(
        { firstName: row.firstName, lastName: row.lastName, studentCode: row.studentCode },
        q,
      );
    });
  }, [status.data?.items, sectionId, search]);

  const paid = filtered.filter((row) => row.status === "PAID");
  const left = filtered.filter((row) => row.status !== "PAID");
  const received = filtered.reduce((sum, row) => sum + row.paid, 0);
  const remaining = filtered.reduce((sum, row) => sum + row.remaining, 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-medium">This month’s collection</h2>
        <p className="text-sm text-muted-foreground">
          {status.data?.monthLabel ?? "This month"} · who has paid, who is still due, and collect from here.
        </p>
      </div>

      {status.isLoading ? (
        <PageLoader variant="panel" />
      ) : status.isError ? (
        <p className="text-sm text-muted-foreground">
          Collection summary is not available yet. You can still collect from the Fees page.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Students paid</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{paid.length}</p>
                <p className="text-xs text-muted-foreground">of {filtered.length} in this class</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Students left</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{left.length}</p>
                <p className="text-xs text-muted-foreground">
                  {left.filter((row) => row.status === "DUE").length} unpaid ·{" "}
                  {left.filter((row) => row.status === "PARTIAL").length} partial
                  {left.some((row) => row.status === "UNBILLED")
                    ? ` · ${left.filter((row) => row.status === "UNBILLED").length} not billed`
                    : ""}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Amount received</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatPkr(received)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Amount left</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatPkr(remaining)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student"
              className="sm:max-w-xs"
            />
            {sections.length > 1 ? (
              <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="sm:max-w-[160px]">
                <option value="">All sections</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    Section {section.name}
                  </option>
                ))}
              </Select>
            ) : null}
            <Link href={`/school/fees${sections[0] ? `?sectionId=${sectionId || sections[0].id}` : ""}`} className="sm:ml-auto">
              <Button variant="outline">Open fees desk</Button>
            </Link>
          </div>

          <div className="rounded-lg border bg-card">
            <div className="border-b px-4 py-3">
              <h3 className="font-medium">Still to collect</h3>
            </div>
            <StudentTable
              rows={left}
              empty="Everyone in this class is paid up this month."
              showPay
            />
          </div>

          <div className="rounded-lg border bg-card">
            <div className="border-b px-4 py-3">
              <h3 className="font-medium">Paid this month</h3>
            </div>
            <StudentTable rows={paid} empty="No payments recorded for this class yet." />
          </div>
        </>
      )}
    </div>
  );
}
