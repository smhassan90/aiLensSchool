"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { platformService } from "@/services/platform.service";
import { personFullName } from "@/lib/person-name";
import { formatDateTime } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";

function statusTone(code: number) {
  if (code >= 500) return "destructive" as const;
  if (code >= 400) return "warning" as const;
  return "secondary" as const;
}

export default function ApiErrorsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusCode, setStatusCode] = useState("");
  const [schoolId, setSchoolId] = useState("");

  const query = useQuery({
    queryKey: ["platform-exception-logs", statusCode, schoolId],
    queryFn: () =>
      platformService.listExceptionLogs({
        limit: 50,
        statusCode: statusCode ? Number(statusCode) : undefined,
        schoolId: schoolId || undefined,
      }),
  });

  const clear = useMutation({
    mutationFn: () => platformService.clearExceptionLogs(true),
    onSuccess: (result) => {
      toast({ title: `Cleared ${result.deleted} error log(s)`, variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["platform-exception-logs"] });
    },
    onError: (err) =>
      toast({
        title: "Could not clear logs",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="API errors"
        description="Every API exception (4xx/5xx) with user, route, and time. Auto-deleted after 7 days."
        actions={
          <Button
            variant="destructive"
            size="sm"
            disabled={clear.isPending}
            onClick={() => {
              if (!window.confirm("Clear all stored API error logs now?")) return;
              clear.mutate();
            }}
          >
            Clear all logs
          </Button>
        }
      />

      <div className="mb-4 grid max-w-2xl gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="filter-status">HTTP status</Label>
          <Input
            id="filter-status"
            placeholder="e.g. 400"
            value={statusCode}
            onChange={(e) => setStatusCode(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="filter-school">School ID</Label>
          <Input
            id="filter-school"
            placeholder="Optional school UUID"
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        {query.isLoading ? (
          <PageLoader variant="panel" />
        ) : query.isError ? (
          <p className="p-4 text-sm text-destructive">{(query.error as Error).message}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>API</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(query.data?.items ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {formatDateTime(row.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusTone(row.statusCode)}>{row.statusCode}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[14rem] truncate font-mono text-xs">
                    {row.method} {row.path}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.errorCode}</TableCell>
                  <TableCell className="text-xs">
                    {row.user
                      ? personFullName(row.user.firstName, row.user.lastName)
                      : "—"}
                    {row.school ? (
                      <span className="block text-muted-foreground">{row.school.name}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-md truncate text-sm">{row.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
