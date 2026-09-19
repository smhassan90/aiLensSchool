"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { headTeachersService } from "@/services/head-teachers.service";
import { formatDate } from "@/lib/utils";

export default function HeadTeacherHomeworkPage() {
  const homework = useQuery({
    queryKey: ["head-teacher-homework"],
    queryFn: () => headTeachersService.listHomework(),
  });

  if (homework.isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader title="Homework" />
        <PageLoader variant="page" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Homework"
        description="Homework assigned by teachers in your supervised classes."
        actions={
          <Link href="/teacher/head">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      <div className="space-y-3">
        {(homework.data?.items ?? []).map((item) => (
          <article key={item.id} className="rounded-xl border bg-card p-4">
            <h2 className="font-semibold">{item.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {item.teacherName}
              {item.classLabel ? ` · ${item.classLabel}` : ""}
              {item.subject?.name ? ` · ${item.subject.name}` : ""}
              {item.dueDate ? ` · due ${formatDate(item.dueDate)}` : ""}
            </p>
          </article>
        ))}
        {!homework.data?.items.length ? (
          <p className="text-sm text-muted-foreground">No homework yet.</p>
        ) : null}
      </div>
    </div>
  );
}
