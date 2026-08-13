"use client";

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
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { teachersService } from "@/services/teachers.service";
import { UserSquare2, Plus } from "lucide-react";

export default function TeachersPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["teachers"],
    queryFn: () => teachersService.list({ limit: 50 }),
  });

  return (
    <div className="p-8">
      <PageHeader
        title="Teachers"
        description="Manage teaching staff and assignments"
        actions={
          <Link href="/school/teachers/new">
            <Button>
              <Plus className="h-4 w-4" />
              Add Teacher
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
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <EmptyState
            icon={<UserSquare2 className="h-10 w-10" />}
            title="No teachers yet"
            description="Add your first teacher to assign classes."
            action={
              <Link href="/school/teachers/new">
                <Button>Add Teacher</Button>
              </Link>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Employee Code</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((teacher) => (
                <TableRow key={teacher.id}>
                  <TableCell className="font-medium">
                    {teacher.user.firstName} {teacher.user.lastName}
                  </TableCell>
                  <TableCell>{teacher.user.email}</TableCell>
                  <TableCell>{teacher.employeeCode}</TableCell>
                  <TableCell>{teacher.branch?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={teacher.status === "ACTIVE" ? "success" : "secondary"}>
                      {teacher.status}
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
