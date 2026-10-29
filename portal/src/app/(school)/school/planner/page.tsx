"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { EmptyState } from "@/components/layout/empty-state";
import { PlannersList, plannerDetailHref } from "@/components/planner/planners-list";
import { academicPlannerService } from "@/services/academic-planner.service";
import { friendlyApiErrorMessage } from "@/lib/display-labels";

export default function SchoolPlannerListPage() {
  const { hasAnyRole } = useAuth();
  const canDelete = hasAnyRole(["PRINCIPAL", "SCHOOL_ADMIN"]);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["planners", { scope: "school" }],
    queryFn: () => academicPlannerService.list({ scope: "school" }),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Planners"
        description="All academic planners in your school. Click a row to open the workspace."
        actions={
          hasAnyRole(["PRINCIPAL", "SCHOOL_ADMIN"]) ? (
            <Link href="/school/planner/approvals">
              <Button type="button" variant="outline" size="sm">Approval queue</Button>
            </Link>
          ) : undefined
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
          title="No planners in this school yet"
          description="When teachers create planners they will appear here for review."
        />
      )}

      {data && data.length > 0 && (
        <PlannersList
          planners={data}
          allowDelete={canDelete}
          plannerHref={(row) => plannerDetailHref("/school/planner", row)}
        />
      )}
    </div>
  );
}
