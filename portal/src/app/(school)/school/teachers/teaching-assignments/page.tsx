"use client";

import { useAuth } from "@/providers/auth-provider";
import { TeachingAssignmentsHub } from "@/components/teachers/teaching-assignments-hub";

export default function TeachingAssignmentsPage() {
  const { can } = useAuth();
  const allowed = can("MANAGE_TEACHERS") || can("MANAGE_CLASSES") || can("VIEW_TEACHER_PROGRESS");

  if (!allowed) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <p className="text-sm text-muted-foreground">You do not have access to teaching assignments.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <TeachingAssignmentsHub />
    </div>
  );
}
