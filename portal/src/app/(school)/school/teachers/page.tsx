"use client";

import { PageLoader } from "@/components/layout/page-loader";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { teacherDisplayNameFromUser } from "@/lib/person-name";
import { ApiClientError } from "@/lib/api-client";
import { useToast } from "@/providers/toast-provider";
import { UserSquare2, Plus } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import type { Teacher } from "@/lib/types";

type ResetResult = {
  teacherId: string;
  username: string | null;
  temporaryPassword: string;
  name: string;
};

export default function TeachersPage() {
  const { can } = useAuth();
  const { toast } = useToast();
  const [confirmTeacher, setConfirmTeacher] = useState<Teacher | null>(null);
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["teachers"],
    queryFn: () => teachersService.list({ limit: 50 }),
  });

  const reset = useMutation({
    mutationFn: (teacher: Teacher) => teachersService.resetPassword(teacher.id),
    onSuccess: (result, teacher) => {
      setConfirmTeacher(null);
      setResetResult({
        teacherId: result.teacherId,
        username: result.username,
        temporaryPassword: result.temporaryPassword,
        name: teacherDisplayNameFromUser(teacher.user, teacher.gender),
      });
    },
    onError: (err) =>
      toast({
        title: "Could not reset password",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Teachers"
        description="Add a teacher from this page. Usernames are used for portal login."
        actions={
          can("MANAGE_TEACHERS") ? (
            <div className="flex gap-2">
              <Link href="/school/teachers/attendance">
                <Button variant="outline">Teacher attendance</Button>
              </Link>
              <Link href="/school/teachers/new">
                <Button>
                  <Plus className="h-4 w-4" />
                  Add Teacher
                </Button>
              </Link>
            </div>
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
                <TableHead>Username</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Employee Code</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                {can("MANAGE_TEACHERS") ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((teacher) => (
                <TableRow key={teacher.id}>
                  <TableCell className="font-medium">
                    <Link href={`/school/teachers/${teacher.id}`} className="hover:underline">
                      {teacherDisplayNameFromUser(teacher.user, teacher.gender)}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {teacher.user.username ?? "—"}
                  </TableCell>
                  <TableCell>{teacher.user.phone ?? "—"}</TableCell>
                  <TableCell>{teacher.employeeCode}</TableCell>
                  <TableCell>{teacher.branch?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={teacher.status === "ACTIVE" ? "success" : "secondary"}>
                      {teacher.status}
                    </Badge>
                  </TableCell>
                  {can("MANAGE_TEACHERS") ? (
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmTeacher(teacher)}
                      >
                        Reset password
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={Boolean(confirmTeacher)} onOpenChange={(open) => { if (!open) setConfirmTeacher(null); }}>
        <DialogContent onClose={() => setConfirmTeacher(null)}>
          <DialogHeader>
            <DialogTitle>Reset teacher password?</DialogTitle>
            <DialogDescription>
              {confirmTeacher
                ? `Create a temporary password for ${teacherDisplayNameFromUser(confirmTeacher.user, confirmTeacher.gender)}. They must change it on next login. Existing sessions will be signed out.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmTeacher(null)} disabled={reset.isPending}>
              Cancel
            </Button>
            <Button
              disabled={!confirmTeacher || reset.isPending}
              onClick={() => confirmTeacher && reset.mutate(confirmTeacher)}
            >
              {reset.isPending ? "Resetting…" : "Reset password"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(resetResult)} onOpenChange={(open) => { if (!open) setResetResult(null); }}>
        <DialogContent onClose={() => setResetResult(null)}>
          <DialogHeader>
            <DialogTitle>Temporary password ready</DialogTitle>
            <DialogDescription>
              Share this once with {resetResult?.name}. It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          {resetResult ? (
            <div className="mt-4 space-y-3 rounded-md border bg-muted/40 p-4 text-sm">
              <p>
                Username: <span className="font-mono">{resetResult.username ?? "—"}</span>
              </p>
              <p>
                Temporary password:{" "}
                <span className="font-mono font-medium">{resetResult.temporaryPassword}</span>
              </p>
            </div>
          ) : null}
          <div className="mt-4 flex justify-end">
            <Button onClick={() => setResetResult(null)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
