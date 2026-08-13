"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { auditService } from "@/services/billing.service";
import { formatDateTime } from "@/lib/utils";
import { FileText } from "lucide-react";

export default function AuditLogsPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => auditService.list({ limit: 50 }),
  });

  return (
    <div className="p-8">
      <PageHeader title="Audit Logs" description="Platform activity and security events" />

      {isError && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <EmptyState
            icon={<FileText className="h-10 w-10" />}
            title="No audit logs"
            description="Activity will be recorded as users interact with the platform."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>School</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{formatDateTime(log.createdAt)}</TableCell>
                  <TableCell className="font-medium">{log.action}</TableCell>
                  <TableCell>
                    {log.entityType} ({log.entityId.slice(0, 8)}…)
                  </TableCell>
                  <TableCell>
                    {log.actor
                      ? `${log.actor.firstName} ${log.actor.lastName}`
                      : "System"}
                  </TableCell>
                  <TableCell>{log.school?.name ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
