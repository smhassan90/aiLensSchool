"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { DayOffRequestsList } from "@/components/parents/day-off-requests-list";
import { parentsService } from "@/services/parents.service";
import { useAuth } from "@/providers/auth-provider";

export default function DayOffRequestsPage() {
  const { user } = useAuth();
  const canReview =
    user?.roles.includes("SCHOOL_ADMIN") || user?.roles.includes("PRINCIPAL");
  const query = useQuery({
    queryKey: ["day-off-requests"],
    queryFn: () => parentsService.listDayOffRequests(),
    refetchOnWindowFocus: true,
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Day-off requests"
        description="Track parent day-off requests. School admins can approve any request; class teachers approve for their own class."
      />
      {query.isLoading ? <PageLoader variant="panel" /> : null}
      {query.isError ? (
        <p className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">
          Could not load day-off requests.
        </p>
      ) : null}
      {!query.isLoading && !query.isError ? (
        <DayOffRequestsList requests={query.data ?? []} canReview={canReview} />
      ) : null}
    </div>
  );
}
