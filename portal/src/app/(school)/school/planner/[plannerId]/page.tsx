"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";
import { PlannerWorkspace } from "@/components/planner/planner-workspace";
import { academicPlannerService } from "@/services/academic-planner.service";

export default function SchoolPlannerWorkspacePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const plannerId = String(params.plannerId ?? "");
  const versionFromQuery = searchParams.get("v");

  const listRow = useQuery({
    queryKey: ["planners", { scope: "school" }],
    queryFn: () => academicPlannerService.list({ scope: "school" }),
    enabled: Boolean(plannerId) && !versionFromQuery,
  });

  const versionIdFromList = listRow.data?.find((p) => p.id === plannerId)?.workingVersionId ?? null;
  const versionId = versionFromQuery ?? versionIdFromList;

  if (!versionFromQuery && listRow.isLoading) {
    return <PageLoader />;
  }

  if (!versionId) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Link href="/school/planner">
          <Button type="button" variant="outline" size="sm">Back to list</Button>
        </Link>
        <EmptyState
          title="Version required"
          description="Open this planner from the school list or add a version id to the URL."
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PlannerWorkspace plannerId={plannerId} versionId={versionId} listHref="/school/planner" />
    </div>
  );
}
