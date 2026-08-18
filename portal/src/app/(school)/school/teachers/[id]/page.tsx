"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { teachersService } from "@/services/teachers.service";
import { PageLoader } from "@/components/layout/page-loader";
import { cn } from "@/lib/utils";

export default function TeacherProgressPage() {
  const params = useParams<{ id: string }>();
  const [coach, setCoach] = useState<Awaited<ReturnType<typeof teachersService.coach>> | null>(null);
  const performance = useQuery({
    queryKey: ["teacher-performance", params.id],
    queryFn: () => teachersService.performance(params.id),
    enabled: Boolean(params.id),
  });
  const suggest = useMutation({
    mutationFn: () => teachersService.coach(params.id),
    onSuccess: setCoach,
  });

  const facts = performance.data as {
    teacher?: { name: string };
    last30Days?: { lessonsAdded: number; attendanceDaysMarked: number };
    byClass?: Array<{
      className: string;
      subject: string;
      quizzes: number;
      attempts: number;
      assigned?: number;
      participation?: number | null;
      average: number | null;
    }>;
  } | undefined;

  if (performance.isLoading) {
    return <div className="p-8"><PageLoader variant="page" phrases={["Opening teacher progress"]} /></div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={facts?.teacher?.name ?? "Teacher"}
        description="Short facts first. Then one button for what to say."
        actions={
          <Button onClick={() => suggest.mutate()} disabled={suggest.isPending}>
            {suggest.isPending ? "Asking AI…" : "What should I say?"}
          </Button>
        }
      />

      {coach && (
        <Card className="mb-6 border-teal-200 bg-teal-50/60">
          <CardHeader>
            <p className="text-xs uppercase tracking-wide text-teal-800">{coach.coaching.verdict.replaceAll("_", " ")}</p>
            <CardTitle className="text-xl">{coach.coaching.headline}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {coach.coaching.cards.map((card) => (
              <div
                key={card.title}
                className={cn(
                  "rounded-lg border bg-white p-4",
                  card.tone === "good" && "border-emerald-200",
                  card.tone === "watch" && "border-amber-200",
                  card.tone === "act" && "border-rose-200",
                )}
              >
                <p className="font-medium">{card.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{card.body}</p>
              </div>
            ))}
            <div className="sm:col-span-2 rounded-lg bg-slate-900 p-4 text-white">
              <p className="text-xs uppercase tracking-wide text-slate-300">Say this</p>
              <p className="mt-1 text-lg leading-snug">{coach.coaching.sayToTeacher}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-sm">Lessons in 30 days</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{facts?.last30Days?.lessonsAdded ?? 0}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Attendance days marked</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{facts?.last30Days?.attendanceDaysMarked ?? 0}</CardContent></Card>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {(facts?.byClass ?? []).map((row) => (
          <Card key={`${row.className}-${row.subject}`}>
            <CardHeader><CardTitle className="text-base">{row.className} · {row.subject}</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {row.quizzes} quizzes · {row.attempts}{row.assigned ? ` / ${row.assigned}` : ""} attempted
              {row.participation != null ? ` · ${row.participation}% joined` : ""} · avg {row.average ?? "—"}%
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
