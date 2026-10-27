"use client";

import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";
import { CalendarDays } from "lucide-react";

export default function AcademicCalendarSetupPage() {
  return (
    <div>
      <PageHeader
        title="Academic calendar"
        description="Mark holidays, exams, and extra working days. Planners and timetables use these dates."
        actions={
          <Link href="/school/setup">
            <Button type="button" variant="outline">Back to setup</Button>
          </Link>
        }
      />
      <EmptyState
        icon={<CalendarDays className="h-10 w-10" />}
        title="Calendar editor coming soon"
        description="The API is available at /academic-calendar. This page will list and edit school calendar days in a later phase."
      />
    </div>
  );
}
