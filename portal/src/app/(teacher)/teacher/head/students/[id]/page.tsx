"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Student360View } from "@/components/students/student-360-view";
import { headTeachersService } from "@/services/head-teachers.service";

export default function HeadTeacherStudent360Page() {
  const params = useParams<{ id: string }>();
  const query = useQuery({
    queryKey: ["head-teacher-student-360", params.id],
    queryFn: () => headTeachersService.getStudent(params.id),
  });

  if (query.isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageLoader variant="page" />
      </div>
    );
  }

  if (!query.data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <p className="text-sm text-destructive">Student not found or outside your classes.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Student 360"
        actions={
          <Link href="/teacher/head/students">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back to search
            </Button>
          </Link>
        }
      />
      <Student360View
        data={query.data}
        studentId={params.id}
        backHref="/teacher/head/students"
      />
    </div>
  );
}
