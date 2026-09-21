"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { parentsService } from "@/services/parents.service";
import { ApiClientError } from "@/lib/api-client";
import { useToast } from "@/providers/toast-provider";

export type DayOffRequestRow = {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote?: string | null;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    studentCode: string;
    enrollments?: Array<{
      section?: { name: string; grade?: { name: string } | null } | null;
    }>;
  };
  parent: { user: { firstName: string; lastName: string; username?: string | null } };
};

function classLabel(request: DayOffRequestRow) {
  const enrollment = request.student.enrollments?.[0];
  if (!enrollment?.section) return null;
  return `${enrollment.section.grade?.name ?? ""} ${enrollment.section.name}`.trim();
}

export function DayOffRequestsList({
  requests,
  canReview = false,
  queryKey = "day-off-requests",
}: {
  requests: DayOffRequestRow[];
  canReview?: boolean;
  queryKey?: string;
}) {
  const client = useQueryClient();
  const { toast } = useToast();
  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "APPROVED" | "REJECTED" }) =>
      parentsService.reviewDayOffRequest(id, status),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: [queryKey] });
      client.invalidateQueries({ queryKey: ["day-off-requests"] });
      toast({ title: "Request updated", variant: "success" });
    },
    onError: (error) =>
      toast({
        title: "Could not update request",
        description: error instanceof ApiClientError ? error.message : "",
        variant: "error",
      }),
  });

  if (!requests.length) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {canReview ? "No day-off requests for your class." : "No day-off requests."}
      </p>
    );
  }

  const pending = requests.filter((request) => request.status === "PENDING");
  const other = requests.filter((request) => request.status !== "PENDING");

  return (
    <div className="space-y-6">
      {canReview && pending.length ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Waiting for your approval ({pending.length})
          </h2>
          <div className="space-y-3">
            {pending.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                canReview={canReview}
                reviewPending={review.isPending}
                onApprove={() => review.mutate({ id: request.id, status: "APPROVED" })}
                onReject={() => review.mutate({ id: request.id, status: "REJECTED" })}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        {canReview && pending.length ? (
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Other requests
          </h2>
        ) : null}
        <div className="space-y-3">
          {(canReview ? other : requests).map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              canReview={canReview}
              reviewPending={review.isPending}
              onApprove={() => review.mutate({ id: request.id, status: "APPROVED" })}
              onReject={() => review.mutate({ id: request.id, status: "REJECTED" })}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function RequestCard({
  request,
  canReview,
  reviewPending,
  onApprove,
  onReject,
}: {
  request: DayOffRequestRow;
  canReview: boolean;
  reviewPending: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const label = classLabel(request);

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">
            {request.student.firstName} {request.student.lastName}
          </p>
          <p className="text-sm text-muted-foreground">
            {request.student.studentCode}
            {label ? ` · ${label}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Parent: {request.parent.user.firstName} {request.parent.user.lastName}
            {request.parent.user.username ? ` · ${request.parent.user.username}` : ""}
          </p>
        </div>
        <Badge
          variant={
            request.status === "APPROVED"
              ? "success"
              : request.status === "REJECTED"
                ? "destructive"
                : "secondary"
          }
        >
          {request.status}
        </Badge>
      </div>
      <p className="mt-3 text-sm font-medium">
        {request.startDate.slice(0, 10)} → {request.endDate.slice(0, 10)}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{request.reason}</p>
      {canReview && request.status === "PENDING" ? (
        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={onApprove} disabled={reviewPending}>
            Approve
          </Button>
          <Button size="sm" variant="outline" onClick={onReject} disabled={reviewPending}>
            Reject
          </Button>
        </div>
      ) : request.reviewNote ? (
        <p className="mt-3 text-xs text-muted-foreground">Review note: {request.reviewNote}</p>
      ) : null}
    </div>
  );
}
