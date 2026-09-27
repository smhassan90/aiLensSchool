"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Teacher360View } from "@/components/teachers/teacher-360-view";

export default function TeacherStaffOverviewPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const fromTeacherProgress = searchParams.get("from") === "teacher-progress";
  const backHref = fromTeacherProgress ? "/teacher/head/teachers" : "/teacher/staff-attendance";
  const backLabel = fromTeacherProgress ? "Teacher progress" : "Staff attendance";

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <Teacher360View
        teacherId={params.id}
        headerActions={
          <Link href={backHref}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Button>
          </Link>
        }
      />
    </div>
  );
}
