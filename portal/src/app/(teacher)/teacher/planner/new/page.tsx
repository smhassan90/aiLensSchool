"use client";

import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { PlannerCreateForm } from "@/components/planner/planner-create-form";

export default function TeacherPlannerNewPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="New academic planner"
        description="Choose class, exam date, and library chapters. Analysis and scheduling come next in the workspace."
        actions={
          <Link href="/teacher/planner">
            <Button type="button" variant="outline">Back to list</Button>
          </Link>
        }
      />
      <PlannerCreateForm />
    </div>
  );
}
