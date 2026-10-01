"use client";

import { PageLoader } from "@/components/layout/page-loader";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
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
import { formatStatusLabel } from "@/lib/display-labels";
import { teacherAssignmentWarningSummary, teacherHasActiveAssignments } from "@/lib/teacher-assignments";
import {
  teacherDeactivateAssignmentToast,
} from "@/lib/teacher-deactivate-toast";

type ResetResult = {
  teacherId: string;
  username: string | null;
  temporaryPassword: string;
  name: string;
};

type StatusConfirm = {
  teacher: Teacher;
  nextStatus: "ACTIVE" | "INACTIVE";
};

export default function TeachersPage() {
  const router = useRouter();
  const { can } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmTeacher, setConfirmTeacher] = useState<Teacher | null>(null);
  const [statusConfirm, setStatusConfirm] = useState<StatusConfirm | null>(null);
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);
  const [status, setStatus] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["teachers", status],
    queryFn: () => teachersService.list({ limit: 100, status: status || undefined }),
  });

  const deactivateDetail = useQuery({
    queryKey: ["teacher", statusConfirm?.teacher.id, "deactivate-check"],
    queryFn: () => teachersService.getById(statusConfirm!.teacher.id),
    enabled: Boolean(statusConfirm?.nextStatus === "INACTIVE" && statusConfirm?.teacher.id),
  });

  const setTeacherStatus = useMutation({
    mutationFn: ({ teacherId, nextStatus }: { teacherId: string; nextStatus: "ACTIVE" | "INACTIVE" }) =>
      teachersService.update(teacherId, { status: nextStatus }),
    onSuccess: async (_, { teacherId, nextStatus }) => {
      setStatusConfirm(null);
      queryClient.invalidateQueries({ queryKey: ["teachers"] });
      if (nextStatus === "INACTIVE") {
        const detail =
          deactivateDetail.data ??
          (await queryClient.fetchQuery({
            queryKey: ["teacher", teacherId],
            queryFn: () => teachersService.getById(teacherId),
          }));
        if (detail && teacherHasActiveAssignments(detail)) {
          const msg = teacherDeactivateAssignmentToast(detail);
          toast({ ...msg, variant: "warning", durationMs: 12000 });
          return;
        }
      }
      toast({
        title: nextStatus === "INACTIVE" ? "Teacher marked inactive" : "Teacher reactivated",
        variant: "success",
      });
    },
    onError: (err) =>
      toast({
        title: "Could not update status",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      }),
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
        description="Open a teacher for their 360° overview — classes, attendance, lessons, and quizzes."
        actions={
          can("MANAGE_TEACHERS") ? (
            <div className="flex flex-wrap gap-2">
              <Link href="/school/teachers/teaching-assignments">
                <Button variant="outline">Teaching assignments</Button>
              </Link>
              <Link href="/school/teachers/head-teachers">
                <Button variant="outline">Head teachers</Button>
              </Link>
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

      <div className="mb-4 max-w-xs">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="ON_LEAVE">On leave</option>
        </Select>
      </div>

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
                <TableRow
                  key={teacher.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  onClick={() => router.push(`/school/teachers/${teacher.id}/overview`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/school/teachers/${teacher.id}/overview`);
                    }
                  }}
                >
                  <TableCell className="font-medium">
                    {teacherDisplayNameFromUser(teacher.user, teacher.gender)}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {teacher.user.username ?? "—"}
                  </TableCell>
                  <TableCell>{teacher.user.phone ?? "—"}</TableCell>
                  <TableCell>{teacher.employeeCode}</TableCell>
                  <TableCell>{teacher.branch?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={teacher.status === "ACTIVE" ? "success" : "secondary"}>
                      {formatStatusLabel(teacher.status)}
                    </Badge>
                  </TableCell>
                  {can("MANAGE_TEACHERS") ? (
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(`/school/teachers/${teacher.id}`);
                          }}
                        >
                          Edit profile
                        </Button>
                        {teacher.status === "INACTIVE" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              setStatusConfirm({ teacher, nextStatus: "ACTIVE" });
                            }}
                          >
                            Activate
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              setStatusConfirm({ teacher, nextStatus: "INACTIVE" });
                            }}
                          >
                            Deactivate
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            setConfirmTeacher(teacher);
                          }}
                        >
                          Reset password
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={Boolean(statusConfirm)} onOpenChange={(open) => { if (!open) setStatusConfirm(null); }}>
        <DialogContent onClose={() => setStatusConfirm(null)}>
          <DialogHeader>
            <DialogTitle>
              {statusConfirm?.nextStatus === "INACTIVE" ? "Deactivate teacher?" : "Reactivate teacher?"}
            </DialogTitle>
            <DialogDescription>
              {statusConfirm
                ? statusConfirm.nextStatus === "INACTIVE"
                  ? `${teacherDisplayNameFromUser(statusConfirm.teacher.user, statusConfirm.teacher.gender)} will not be able to sign in. Their classes and history stay on record.${
                      deactivateDetail.data && teacherHasActiveAssignments(deactivateDetail.data)
                        ? " This teacher still has subjects or classes assigned — you should reassign them soon."
                        : ""
                    }`
                  : `${teacherDisplayNameFromUser(statusConfirm.teacher.user, statusConfirm.teacher.gender)} can sign in again.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStatusConfirm(null)} disabled={setTeacherStatus.isPending}>
              Cancel
            </Button>
            <Button
              disabled={!statusConfirm || setTeacherStatus.isPending}
              onClick={() =>
                statusConfirm &&
                setTeacherStatus.mutate({
                  teacherId: statusConfirm.teacher.id,
                  nextStatus: statusConfirm.nextStatus,
                })
              }
            >
              {setTeacherStatus.isPending ? "Saving…" : statusConfirm?.nextStatus === "INACTIVE" ? "Deactivate" : "Activate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
