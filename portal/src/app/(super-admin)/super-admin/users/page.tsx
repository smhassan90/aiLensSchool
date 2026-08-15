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
import { usersService } from "@/services/billing.service";
import { Users } from "lucide-react";

export default function UsersPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["users"],
    queryFn: () => usersService.list({ limit: 50 }),
  });

  return (
    <div className="p-8">
      <PageHeader title="Users" description="Platform user accounts across all schools" />

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
            icon={<Users className="h-10 w-10" />}
            title="No users found"
            description="Users are created when schools and staff are onboarded."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>School</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.firstName} {user.lastName}
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.school?.name ?? "Platform"}</TableCell>
                  <TableCell>
                    <Badge variant={user.status === "ACTIVE" ? "success" : "secondary"}>
                      {user.status}
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
