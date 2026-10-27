"use client";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";

export default function HeadTeacherPlannersPage() {
  return (
    <div>
      <PageHeader
        title="Section planners"
        description="Review academic planners for sections you head."
      />
      <EmptyState
        title="Coming soon"
        description="Section planner overview will appear here in a later phase."
      />
    </div>
  );
}
