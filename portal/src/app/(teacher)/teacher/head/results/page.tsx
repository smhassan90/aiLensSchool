"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { headTeachersService } from "@/services/head-teachers.service";
import { formatDate, formatMarks } from "@/lib/utils";

export default function HeadTeacherResultsPage() {
  const results = useQuery({
    queryKey: ["head-teacher-results"],
    queryFn: () => headTeachersService.listResults(),
  });

  if (results.isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader title="Results" />
        <PageLoader variant="page" />
      </div>
    );
  }

  const data = results.data;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Quiz & exam results"
        description="Recent results for students in your supervised classes."
        actions={
          <Link href="/teacher/head">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Quiz results</h2>
        <div className="space-y-3">
          {(data?.quizResults ?? []).map((row) => (
            <article key={row.id} className="rounded-xl border bg-card p-4">
              <p className="font-medium">{row.studentName}</p>
              <p className="text-sm text-muted-foreground">
                {row.quizTitle}
                {row.classLabel ? ` · ${row.classLabel}` : ""}
                {row.subjectName ? ` · ${row.subjectName}` : ""}
                {` · ${row.percentage.toFixed(1)}%`}
                {row.submittedAt ? ` · ${formatDate(row.submittedAt)}` : ""}
              </p>
            </article>
          ))}
          {!data?.quizResults.length ? (
            <p className="text-sm text-muted-foreground">No quiz results yet.</p>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Exam results</h2>
        <div className="space-y-3">
          {(data?.examResults ?? []).map((row) => (
            <article key={row.id} className="rounded-xl border bg-card p-4">
              <p className="font-medium">{row.studentName}</p>
              <p className="text-sm text-muted-foreground">
                {row.examName}
                {row.classLabel ? ` · ${row.classLabel}` : ""}
                {row.subjectName ? ` · ${row.subjectName}` : ""}
                {` · ${formatMarks(row.marksObtained)}/${formatMarks(row.maxMarks)}`}
                {row.assessedAt ? ` · ${formatDate(row.assessedAt)}` : ""}
              </p>
            </article>
          ))}
          {!data?.examResults.length ? (
            <p className="text-sm text-muted-foreground">No exam results yet.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
