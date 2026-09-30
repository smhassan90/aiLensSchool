"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { teachersService } from "@/services/teachers.service";
import { ApiClientError } from "@/lib/api-client";
import { useToast } from "@/providers/toast-provider";
import { KeyRound } from "lucide-react";

type ResetResult = {
  username: string | null;
  temporaryPassword: string;
  name: string;
};

export function TeacherResetPasswordDialog({
  teacherId,
  teacherName,
  triggerVariant = "outline",
  triggerSize = "sm",
  triggerLabel = "Reset password",
}: {
  teacherId: string;
  teacherName: string;
  triggerVariant?: "outline" | "default" | "secondary" | "ghost";
  triggerSize?: "sm" | "default";
  triggerLabel?: string;
}) {
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);

  const reset = useMutation({
    mutationFn: () => teachersService.resetPassword(teacherId),
    onSuccess: (result) => {
      setConfirmOpen(false);
      setResetResult({
        username: result.username,
        temporaryPassword: result.temporaryPassword,
        name: teacherName,
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
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size={triggerSize}
        onClick={() => setConfirmOpen(true)}
      >
        <KeyRound className="mr-1.5 h-4 w-4" />
        {triggerLabel}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) setConfirmOpen(false); }}>
        <DialogContent onClose={() => setConfirmOpen(false)}>
          <DialogHeader>
            <DialogTitle>Reset teacher password?</DialogTitle>
            <DialogDescription>
              Create a temporary password for {teacherName}. They must change it on next login. Existing
              sessions will be signed out.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={reset.isPending}>
              Cancel
            </Button>
            <Button disabled={reset.isPending} onClick={() => reset.mutate()}>
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
    </>
  );
}
