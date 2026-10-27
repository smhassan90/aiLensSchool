"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { academicPlannerService, PlannerVersionPayload } from "@/services/academic-planner.service";
import { RecoveryDiffTable, RecoveryImpactView } from "@/components/planner/recovery-diff-table";
import { RecoveryRequestDialog } from "@/components/planner/recovery-request-dialog";
import { useToast } from "@/providers/toast-provider";
import { friendlyApiErrorMessage } from "@/lib/display-labels";

type PlannerRecoveryPanelProps = {
  plannerId: string;
  versionId: string;
  payload: PlannerVersionPayload;
};

export function PlannerRecoveryPanel({ plannerId, versionId, payload }: PlannerRecoveryPanelProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const isRecovery = payload.version.origin === "RECOVERY";
  const impact = payload.version.impact as RecoveryImpactView | null;

  const requestRecovery = useMutation({
    mutationFn: (body: Parameters<typeof academicPlannerService.createRecoveryProposal>[1]) =>
      academicPlannerService.createRecoveryProposal(plannerId, body),
    onSuccess: (next) => {
      toast({ title: "Recovery proposal generated", variant: "success" });
      router.push(`/teacher/planner/${plannerId}?v=${encodeURIComponent(next.version.id)}`);
    },
    onError: (err) => {
      toast({
        title: "Could not create recovery proposal",
        description: friendlyApiErrorMessage(err),
        variant: "error",
      });
    },
  });

  const regenerate = useMutation({
    mutationFn: () => {
      const keys = impact?.selectedLessonKeys?.length
        ? impact.selectedLessonKeys
        : [];
      if (!keys.length) {
        throw new Error("No selected lessons stored on this proposal; create a new recovery request.");
      }
      return academicPlannerService.regenerateRecoveryProposal(plannerId, versionId, {
        lessonKeys: keys,
        reason: payload.version.changeReason ?? "OTHER",
        reasonNote: payload.version.changeReasonNote ?? undefined,
        includeUnreported: Boolean(impact?.unreportedInferred?.length),
        allowBufferUse: true,
        allowCompression: true,
        allowActivityRemoval: false,
        expectedRevision: payload.version.revision,
      });
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["planner-version", plannerId, versionId], next);
      toast({ title: "Recovery proposal updated", variant: "success" });
    },
    onError: (err) => {
      toast({
        title: "Could not regenerate",
        description: friendlyApiErrorMessage(err),
        variant: "error",
      });
    },
  });

  if (payload.permissions.canRequestRecovery) {
    return (
      <RecoveryRequestDialog
        plannerId={plannerId}
        isPending={requestRecovery.isPending}
        onSubmit={(body) => requestRecovery.mutate(body)}
      />
    );
  }

  if (!isRecovery) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
        <p className="font-medium">Recovery proposal (not active until approved)</p>
        <p className="text-muted-foreground">
          Based on approved version {payload.version.basedOnVersionId?.slice(0, 8) ?? "—"} · Status:{" "}
          {payload.version.status}
        </p>
      </div>

      {payload.permissions.canRegenerateRecovery && (
        <Button type="button" variant="outline" disabled={regenerate.isPending} onClick={() => regenerate.mutate()}>
          {regenerate.isPending ? "Regenerating…" : "Regenerate from latest records"}
        </Button>
      )}

      {impact && <RecoveryDiffTable impact={impact} />}
    </div>
  );
}
