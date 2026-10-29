"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";
import { PlannersList, plannerDetailHref } from "@/components/planner/planners-list";
import { academicPlannerService } from "@/services/academic-planner.service";
import { friendlyApiErrorMessage } from "@/lib/display-labels";

export default function TeacherPlannerListPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["planners", { scope: "mine" }],
    queryFn: () => academicPlannerService.list({ scope: "mine" }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Planners"
        description="All your academic planners. Open one to analyze chapters, generate the schedule, or get teaching help."
        actions={
          <Link href="/teacher/planner/new">
            <Button type="button">
              <Plus className="h-4 w-4" />
              New planner
            </Button>
          </Link>
        }
      />

      {isLoading && <PageLoader />}
      {isError && (
        <EmptyState
          title="Could not load planners"
          description={friendlyApiErrorMessage(error)}
        />
      )}

      {!isLoading && !isError && (data?.length ?? 0) === 0 && (
        <EmptyState
          icon={<CalendarRange className="h-10 w-10" />}
          title="No planners yet"
          description="Create a planner for one of your classes to schedule library chapters before the exam."
          action={
            <Link href="/teacher/planner/new">
              <Button type="button">Create planner</Button>
            </Link>
          }
        />
      )}

      {data && data.length > 0 && (
        <PlannersList
          planners={data}
          allowDelete
          plannerHref={(row) => plannerDetailHref("/teacher/planner", row)}
        />
      )}
    </div>
  );
}
