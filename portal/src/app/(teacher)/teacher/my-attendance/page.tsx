"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { teachersService } from "@/services/teachers.service";
import { Teacher360View } from "@/components/teachers/teacher-360-view";

export default function TeacherMyAttendancePage() {
  const supervision = useQuery({
    queryKey: ["teacher-supervision"],
    queryFn: () => teachersService.getSupervision(),
  });

  if (supervision.isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageLoader variant="page" />
      </div>
    );
  }

  const self = supervision.data?.self;
  if (!self) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader title="My attendance" />
        <p className="text-sm text-muted-foreground">Could not load your teacher profile.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <Teacher360View
        teacherId={self.id}
        headerActions={
          <Link href="/teacher/dashboard">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Button>
          </Link>
        }
      />
    </div>
  );
}
