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
import { branchesService } from "@/services/branches.service";
import { GitBranch } from "lucide-react";

export default function BranchesPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["branches"],
    queryFn: () => branchesService.list({ limit: 50 }),
  });

  return (
    <div className="p-8">
      <PageHeader title="Branches" description="All branches across onboarded schools" />

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
            icon={<GitBranch className="h-10 w-10" />}
            title="No branches found"
            description="Branches are created when schools are onboarded."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((branch) => (
                <TableRow key={branch.id}>
                  <TableCell className="font-medium">{branch.name}</TableCell>
                  <TableCell>{branch.code}</TableCell>
                  <TableCell>{branch.address ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={branch.status === "ACTIVE" ? "success" : "secondary"}>
                      {branch.status}
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
