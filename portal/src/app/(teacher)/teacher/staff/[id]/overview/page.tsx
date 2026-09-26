"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Teacher360View } from "@/components/teachers/teacher-360-view";

export default function TeacherStaffOverviewPage() {
  const params = useParams<{ id: string }>();

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <Teacher360View
        teacherId={params.id}
        headerActions={
          <Link href="/teacher/staff-attendance">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Staff attendance
            </Button>
          </Link>
        }
      />
    </div>
  );
}
