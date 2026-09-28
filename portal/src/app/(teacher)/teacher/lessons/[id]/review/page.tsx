"use client";

import { useParams } from "next/navigation";
import { LessonReviewWizard } from "@/components/lessons/lesson-review-wizard";

export default function ReviewLessonPage() {
  const params = useParams<{ id: string }>();
  return <LessonReviewWizard lessonId={params.id} />;
}
