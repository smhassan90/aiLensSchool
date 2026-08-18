"use client";

import { PageLoader } from "@/components/layout/page-loader";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { billingService } from "@/services/billing.service";
import { formatDate } from "@/lib/utils";
import { Receipt } from "lucide-react";

export default function BillingPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => billingService.listInvoices({ limit: 50 }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader title="Billing" description="Generated invoices across schools" />

      {isError && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <PageLoader variant="panel" />
        ) : !data?.items.length ? (
          <EmptyState
            icon={<Receipt className="h-10 w-10" />}
            title="No invoices yet"
            description="Invoices will appear here once generated for schools."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>School</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Period</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                  <TableCell>{inv.school?.name ?? "—"}</TableCell>
                  <TableCell>
                    {inv.currency} {Number(inv.amount).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={inv.status === "PAID" ? "success" : inv.status === "OVERDUE" ? "destructive" : "secondary"}>
                      {inv.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
