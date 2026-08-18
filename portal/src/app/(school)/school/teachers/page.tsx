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
import { teachersService } from "@/services/teachers.service";
import { UserSquare2, Plus } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";

export default function TeachersPage() {
  const { can } = useAuth();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["teachers"],
    queryFn: () => teachersService.list({ limit: 50 }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Teachers"
        description="Add a teacher from this page. Open a name to see progress."
        actions={
          can("MANAGE_TEACHERS") ? (
            <Link href="/school/teachers/new">
              <Button>
                <Plus className="h-4 w-4" />
                Add Teacher
              </Button>
            </Link>
          ) : undefined
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
            icon={<UserSquare2 className="h-10 w-10" />}
            title="No teachers yet"
            description="Add your first teacher to assign classes."
            action={
              can("MANAGE_TEACHERS") ? (
                <Link href="/school/teachers/new">
                  <Button>Add Teacher</Button>
                </Link>
              ) : undefined
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
                    <Link href={`/school/teachers/${teacher.id}`} className="hover:underline">
                      {teacher.user.firstName} {teacher.user.lastName}
                    </Link>
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
