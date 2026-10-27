"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";
import { PlannerWorkspace } from "@/components/planner/planner-workspace";
import { academicPlannerService } from "@/services/academic-planner.service";

export default function TeacherPlannerWorkspacePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const plannerId = String(params.plannerId ?? "");
  const versionFromQuery = searchParams.get("v");

  const listRow = useQuery({
    queryKey: ["planners", { scope: "mine" }],
    queryFn: () => academicPlannerService.list({ scope: "mine" }),
    enabled: Boolean(plannerId) && !versionFromQuery,
  });

  const versionIdFromList = listRow.data?.find((p) => p.id === plannerId)?.workingVersionId ?? null;
  const versionId = versionFromQuery ?? versionIdFromList;

  if (!versionFromQuery && listRow.isLoading) {
    return <PageLoader />;
  }

  if (!versionId) {
    return (
      <div className="space-y-4">
        <Link href="/teacher/planner">
          <Button type="button" variant="outline">Back to list</Button>
        </Link>
        <EmptyState
          title="Open a planner version"
          description="Add ?v=&lt;versionId&gt; to the URL after creating a planner, or pick one from the list when school listing is available."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link href="/teacher/planner">
        <Button type="button" variant="outline" size="sm">All planners</Button>
      </Link>
      <PlannerWorkspace plannerId={plannerId} versionId={versionId} />
    </div>
  );
}
