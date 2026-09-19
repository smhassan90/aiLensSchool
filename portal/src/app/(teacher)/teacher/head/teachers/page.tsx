"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { CriterionBars, scoreTextClass } from "@/components/teachers/teacher-score-visuals";
import { headTeachersService } from "@/services/head-teachers.service";
import { cn } from "@/lib/utils";

export default function HeadTeacherTeachersPage() {
  const progress = useQuery({
    queryKey: ["head-teacher-teacher-progress"],
    queryFn: () => headTeachersService.getTeacherProgress(),
  });

  if (progress.isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader title="Teacher progress" />
        <PageLoader variant="page" />
      </div>
    );
  }

  const teachers = progress.data?.teachers ?? [];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Teacher progress"
        description="Teachers teaching in your supervised classes."
        actions={
          <Link href="/teacher/head">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      <div className="space-y-4">
        {teachers.map((row) => (
          <article key={row.teacher.id} className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">{row.teacher.name}</h2>
                <p className="text-sm text-muted-foreground">Rank #{row.rank}</p>
              </div>
              <p className={cn("text-2xl font-semibold", scoreTextClass(row.total))}>{row.total}/100</p>
            </div>
            <CriterionBars scores={row.scores} weights={progress.data?.weights ?? []} />
          </article>
        ))}
        {!teachers.length ? (
          <p className="text-sm text-muted-foreground">No teachers found in your supervised classes.</p>
        ) : null}
      </div>
    </div>
  );
}
