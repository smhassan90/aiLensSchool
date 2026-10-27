"use client";

import { PageHeader } from "@/components/layout/page-header";
import { TodayLessonsList } from "@/components/planner/today-lessons-list";

export default function TeacherPlannerTodayPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Today's planned lessons"
        description="Scheduled periods from your timetable and approved academic planner. Unreported lessons stay as not yet reported."
      />
      <TodayLessonsList />
    </div>
  );
}
