"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageLoader } from "@/components/layout/page-loader";
import { LessonReviewWizard } from "@/components/lessons/lesson-review-wizard";
import { lessonsService } from "@/services/lessons.service";

export default function ReviewLessonPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ["lesson", params.id],
    queryFn: () => lessonsService.getById(params.id),
  });

  useEffect(() => {
    if (!data) return;
    if (data.recordKind === "CHAPTER_LIBRARY" || (!data.recordKind && data.status !== "CONFIRMED")) {
      router.replace(`/teacher/lessons/chapters/${params.id}`);
    }
  }, [data, params.id, router]);

  if (isLoading || !data) {
    return <PageLoader variant="page" task="lesson-review" />;
  }

  if (data.recordKind === "CLASS_SESSION") {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <p className="text-sm text-muted-foreground">
          This class day was saved on {data.date}.{" "}
          <a href="/teacher/lessons" className="text-primary underline">Back to lessons</a>
        </p>
        {data.parentSummary && <p className="mt-4 whitespace-pre-wrap">{data.parentSummary}</p>}
      </div>
    );
  }

  if (data.recordKind === "CHAPTER_LIBRARY") {
    return <PageLoader variant="page" task="lesson-review" />;
  }

  return <LessonReviewWizard lessonId={params.id} />;
}
