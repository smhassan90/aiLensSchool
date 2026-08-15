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
import { Tag } from "lucide-react";

export default function PricingPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["pricing-plans"],
    queryFn: () => billingService.listPlans({ limit: 20 }),
  });

  return (
    <div className="p-8">
      <PageHeader title="Pricing Plans" description="Platform pricing configuration" />

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
            icon={<Tag className="h-10 w-10" />}
            title="No pricing plans"
            description="Seed the database to create default pricing plans."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Per Student</TableHead>
                <TableHead>Minimum Fee</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">{plan.name}</TableCell>
                  <TableCell>{plan.pricePerStudent}</TableCell>
                  <TableCell>{plan.minimumMonthlyFee}</TableCell>
                  <TableCell>{plan.currency}</TableCell>
                  <TableCell>
                    <Badge variant={plan.active ? "success" : "secondary"}>
                      {plan.active ? "Active" : "Inactive"}
                    </Badge>
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
