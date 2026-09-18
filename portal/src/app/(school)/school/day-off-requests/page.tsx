"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { parentsService } from "@/services/parents.service";
import { ApiClientError } from "@/lib/api-client";
import { useToast } from "@/providers/toast-provider";

export default function DayOffRequestsPage() {
  const client = useQueryClient();
  const { toast } = useToast();
  const query = useQuery({
    queryKey: ["day-off-requests"],
    queryFn: parentsService.listDayOffRequests,
  });
  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "APPROVED" | "REJECTED" }) =>
      parentsService.reviewDayOffRequest(id, status),
    onSuccess: () => {
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

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Day-off requests"
        description="Review parent requests before they affect attendance."
      />
      {query.isLoading ? <PageLoader variant="panel" /> : null}
      {query.isError ? (
        <p className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">
          Could not load day-off requests.
        </p>
      ) : null}
      {!query.isLoading && !query.data?.length ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No day-off requests.
        </p>
      ) : (
        <div className="space-y-3">
          {query.data?.map((request) => (
            <div key={request.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {request.student.firstName} {request.student.lastName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Parent: {request.parent.user.firstName} {request.parent.user.lastName} ·{" "}
                    {request.parent.user.username ?? "—"}
                  </p>
                </div>
                <Badge variant={request.status === "APPROVED" ? "success" : request.status === "REJECTED" ? "destructive" : "secondary"}>
                  {request.status}
                </Badge>
              </div>
              <p className="mt-3 text-sm font-medium">
                {request.startDate.slice(0, 10)} → {request.endDate.slice(0, 10)}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{request.reason}</p>
              {request.status === "PENDING" ? (
                <div className="mt-4 flex gap-2">
                  <Button size="sm" onClick={() => review.mutate({ id: request.id, status: "APPROVED" })} disabled={review.isPending}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => review.mutate({ id: request.id, status: "REJECTED" })} disabled={review.isPending}>
                    Reject
                  </Button>
                </div>
              ) : request.reviewNote ? (
                <p className="mt-3 text-xs text-muted-foreground">Review note: {request.reviewNote}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
