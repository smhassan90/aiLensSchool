"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Student360View, type Student360Data } from "@/components/students/student-360-view";
import { insightsService } from "@/services/insights.service";
import { ArrowLeft } from "lucide-react";

export default function TeacherStudent360Page() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();

  const backHref = useMemo(() => {
    const sectionId = search.get("sectionId");
    if (search.get("from") === "roster" && sectionId) {
      const q = new URLSearchParams();
      const grade = search.get("grade");
      const section = search.get("section");
      const subject = search.get("subject");
      if (grade) q.set("grade", grade);
      if (section) q.set("section", section);
      if (subject) q.set("subject", subject);
      const qs = q.toString();
      return `/teacher/classes/section/${sectionId}/students${qs ? `?${qs}` : ""}`;
    }
    return "/teacher/classes";
  }, [search]);

  const query = useQuery({
    queryKey: ["teacher-student-360", params.id],
    queryFn: () => insightsService.student(params.id) as Promise<Student360Data>,
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
        <Link href={backHref} className="mt-4 inline-block">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <Student360View
        data={query.data}
        studentId={params.id}
        backHref={backHref}
        backLabel={search.get("from") === "roster" ? "Class roster" : "My classes"}
      />
    </div>
  );
}
