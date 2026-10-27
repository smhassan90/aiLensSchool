"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  academicPlannerService,
  type PlannerVersionPayload,
} from "@/services/academic-planner.service";
import { useToast } from "@/providers/toast-provider";
import { friendlyApiErrorMessage } from "@/lib/display-labels";

type PlannerApprovalActionsProps = {
  plannerId: string;
  versionId: string;
  payload: PlannerVersionPayload;
};

export function PlannerApprovalActions({ plannerId, versionId, payload }: PlannerApprovalActionsProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<"submit" | "reject" | "changes" | "approve" | null>(null);
  const [comment, setComment] = useState("");
  const [ackRisk, setAckRisk] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["planner-version", plannerId, versionId] });
    void queryClient.invalidateQueries({ queryKey: ["planner-approvals"] });
    void queryClient.invalidateQueries({ queryKey: ["planners"] });
  };

  const onSuccess = (title: string) => (next: PlannerVersionPayload) => {
    queryClient.setQueryData(["planner-version", plannerId, versionId], next);
    invalidate();
    setDialog(null);
    setComment("");
    toast({ title, variant: "success" });
  };

  const onError = (title: string) => (err: unknown) => {
    toast({ title, description: friendlyApiErrorMessage(err), variant: "error" });
  };

  const submit = useMutation({
    mutationFn: () =>
      academicPlannerService.submit(plannerId, versionId, {
        expectedRevision: payload.version.revision,
        acknowledgeRisk: ackRisk || undefined,
      }),
    onSuccess: onSuccess("Submitted for approval"),
    onError: onError("Could not submit"),
  });

  const approve = useMutation({
    mutationFn: () =>
      academicPlannerService.approve(plannerId, versionId, {
        expectedRevision: payload.version.revision,
        comment: comment.trim() || undefined,
      }),
    onSuccess: onSuccess("Planner approved"),
    onError: onError("Could not approve"),
  });

  const reject = useMutation({
    mutationFn: () =>
      academicPlannerService.reject(plannerId, versionId, {
        expectedRevision: payload.version.revision,
        comment: comment.trim(),
      }),
    onSuccess: onSuccess("Planner rejected"),
    onError: onError("Could not reject"),
  });

  const requestChanges = useMutation({
    mutationFn: () =>
      academicPlannerService.requestChanges(plannerId, versionId, {
        expectedRevision: payload.version.revision,
        comment: comment.trim(),
      }),
    onSuccess: onSuccess("Changes requested"),
    onError: onError("Could not request changes"),
  });

  const withdraw = useMutation({
    mutationFn: () =>
      academicPlannerService.withdraw(plannerId, versionId, payload.version.revision),
    onSuccess: onSuccess("Submission withdrawn"),
    onError: onError("Could not withdraw"),
  });

  const publishDirect = useMutation({
    mutationFn: () =>
      academicPlannerService.publishDirect(plannerId, versionId, payload.version.revision),
    onSuccess: onSuccess("Planner published"),
    onError: onError("Could not publish"),
  });

  const feasibility = payload.version.summary?.feasibility;
  const needsRiskAck = feasibility && feasibility !== "FEASIBLE";

  const busy =
    submit.isPending ||
    approve.isPending ||
    reject.isPending ||
    requestChanges.isPending ||
    publishDirect.isPending ||
    withdraw.isPending;

  return (
    <div className="flex flex-wrap gap-2">
      {payload.permissions.canWithdraw && (
        <Button type="button" variant="outline" disabled={busy} onClick={() => withdraw.mutate()}>
          {withdraw.isPending ? "Withdrawing…" : "Withdraw submission"}
        </Button>
      )}
      {payload.permissions.canSubmit && (
        <Button type="button" disabled={busy} onClick={() => setDialog("submit")}>
          Submit for approval
        </Button>
      )}
      {payload.permissions.canPublishDirectly && (
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !payload.version.summary}
          onClick={() => publishDirect.mutate()}
        >
          {publishDirect.isPending ? "Publishing…" : "Publish (principal)"}
        </Button>
      )}
      {payload.permissions.canDecide && (
        <>
          <Button type="button" disabled={busy} onClick={() => setDialog("approve")}>
            Approve
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setDialog("changes")}>
            Request changes
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => setDialog("reject")}>
            Reject
          </Button>
        </>
      )}

      <Dialog open={dialog === "submit"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent onClose={() => setDialog(null)}>
          <DialogHeader>
            <DialogTitle>Submit for principal approval</DialogTitle>
            <DialogDescription>
              The principal will review this version. You cannot edit it while it is submitted.
            </DialogDescription>
          </DialogHeader>
          {needsRiskAck && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={ackRisk}
                onChange={(e) => setAckRisk(e.target.checked)}
                className="mt-1"
              />
              <span>
                I acknowledge the schedule is {feasibility?.toLowerCase()} and may not meet the exam
                deadline without changes.
              </span>
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              type="button"
              disabled={busy || (needsRiskAck && !ackRisk)}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? "Submitting…" : "Submit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "approve"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent onClose={() => setDialog(null)}>
          <DialogHeader>
            <DialogTitle>Approve planner</DialogTitle>
            <DialogDescription>Optional comment for the teacher.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="approve-comment">Comment</Label>
            <Textarea id="approve-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button type="button" disabled={busy} onClick={() => approve.mutate()}>
              {approve.isPending ? "Approving…" : "Approve"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "changes"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent onClose={() => setDialog(null)}>
          <DialogHeader>
            <DialogTitle>Request changes</DialogTitle>
            <DialogDescription>Explain what the teacher should update before resubmitting.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="changes-comment">Comment (required)</Label>
            <Textarea
              id="changes-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              type="button"
              disabled={busy || comment.trim().length < 3}
              onClick={() => requestChanges.mutate()}
            >
              {requestChanges.isPending ? "Sending…" : "Send to teacher"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "reject"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent onClose={() => setDialog(null)}>
          <DialogHeader>
            <DialogTitle>Reject planner</DialogTitle>
            <DialogDescription>Provide a reason the teacher will see in the plan history.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-comment">Reason (required)</Label>
            <Textarea
              id="reject-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || comment.trim().length < 3}
              onClick={() => reject.mutate()}
            >
              {reject.isPending ? "Rejecting…" : "Reject"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
