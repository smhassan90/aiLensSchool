"use client";

import { PageLoader } from "@/components/layout/page-loader";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
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
import { schoolsService } from "@/services/schools.service";
import { formatDate } from "@/lib/utils";
import { assetUrl } from "@/lib/api-client";
import { Plus, Pencil, School } from "lucide-react";

function statusVariant(status: string) {
  switch (status) {
    case "ACTIVE":
      return "success" as const;
    case "SUSPENDED":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

export default function SchoolsPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["schools"],
    queryFn: () => schoolsService.list({ limit: 50 }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Schools"
        description="Manage onboarded schools and their status"
        actions={
          <Link href="/super-admin/schools/new">
            <Button>
              <Plus className="h-4 w-4" />
              Add School
            </Button>
          </Link>
        }
      />

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
            icon={<School className="h-10 w-10" />}
            title="No schools yet"
            description="Create your first school to get started."
            action={
              <Link href="/super-admin/schools/new">
                <Button>Add School</Button>
              </Link>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Logo</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((school) => (
                <TableRow key={school.id}>
                  <TableCell>
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
                      {school.logo ? (
                        <img
                          src={assetUrl(school.logo) ?? undefined}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <School className="h-4 w-4 text-muted-foreground/50" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/super-admin/schools/${school.id}`} className="hover:underline">
                      {school.name}
                    </Link>
                  </TableCell>
                  <TableCell>{school.code}</TableCell>
                  <TableCell>{school.email}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(school.status)}>{school.status}</Badge>
                  </TableCell>
                  <TableCell>{formatDate(school.createdAt)}</TableCell>
                  <TableCell>
                    <Link href={`/super-admin/schools/${school.id}`}>
                      <Button variant="ghost" size="icon" aria-label={`Edit ${school.name}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </Link>
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
