"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { teachersService } from "@/services/teachers.service";
import { PageLoader } from "@/components/layout/page-loader";
import { AiWait } from "@/components/layout/ai-wait";
import { CriterionBars, scoreTextClass } from "@/components/teachers/teacher-score-visuals";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

export default function TeacherProgressPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const { can } = useAuth();
  const autoAi = search.get("ai") === "1";
  const [coach, setCoach] = useState<Awaited<ReturnType<typeof teachersService.coach>> | null>(null);

  const board = useQuery({
    queryKey: ["teacher-scoreboard"],
    queryFn: () => teachersService.scoreboard(),
  });
  const performance = useQuery({
    queryKey: ["teacher-performance", params.id],
    queryFn: () => teachersService.performance(params.id),
    enabled: Boolean(params.id),
  });
  const suggest = useMutation({
    mutationFn: () => teachersService.coach(params.id),
    onSuccess: setCoach,
  });

  useEffect(() => {
    if (autoAi && params.id && !coach && !suggest.isPending && !suggest.isSuccess) {
      suggest.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAi, params.id]);

  const facts = performance.data;
  const ranked = board.data?.teachers.find((row) => row.teacher.id === params.id);
  const total = ranked?.total ?? facts?.total ?? 0;
  const rank = ranked?.rank;

  if (performance.isLoading) {
    return (
      <div className="p-8">
        <PageLoader variant="page" phrases={["Opening teacher progress"]} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={facts?.teacher?.name ?? "Teacher"}
        description="Only this teacher’s classes and subjects. Use this before an end-of-day or weekend conversation."
        actions={
          <div className="flex gap-2">
            <Link href="/school/dashboard">
              <Button variant="outline">Back to ranking</Button>
            </Link>
            <Button onClick={() => suggest.mutate()} disabled={suggest.isPending}>
              <Sparkles className="h-4 w-4" />
              {suggest.isPending ? "Asking AI…" : "AI analysis"}
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Weighted score</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-3xl font-semibold", scoreTextClass(total))}>{total}</p>
            <p className="mt-1 text-xs text-muted-foreground">Out of 100, after missing data is left out</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Rank among teachers</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{rank ? `#${rank}` : "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">1 is the strongest this period</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Annual / term results</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{facts?.metrics.annual.average ?? "—"}%</p>
            <p className="mt-1 text-xs text-muted-foreground">{facts?.metrics.annual.source ?? ""}</p>
          </CardContent>
        </Card>
      </div>

      {suggest.isPending ? (
        <div className="mb-6">
          <AiWait kind="coach" />
        </div>
      ) : coach ? (
        <Card className="mb-6 border-teal-200 bg-teal-50/60">
          <CardHeader>
            <p className="text-xs uppercase tracking-wide text-teal-800">
              {coach.coaching.verdict.replaceAll("_", " ")}
            </p>
            <CardTitle className="text-xl">{coach.coaching.headline}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-emerald-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Going well</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                  {(coach.coaching.strengths ?? []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-amber-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Discuss this</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                  {(coach.coaching.discussTonight?.length
                    ? coach.coaching.discussTonight
                    : coach.coaching.improvements ?? []
                  ).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
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
            </div>
            <div className="rounded-lg bg-slate-900 p-4 text-white">
              <p className="text-xs uppercase tracking-wide text-slate-300">Say this</p>
              <p className="mt-1 text-lg leading-snug">{coach.coaching.sayToTeacher}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Score breakdown</CardTitle>
          <p className="text-sm text-muted-foreground">
            Annual results and lesson uploads weigh most. Student attendance is light because it is often a home issue.
          </p>
        </CardHeader>
        <CardContent>
          {board.data?.weights && facts ? (
            <CriterionBars scores={facts.scores} weights={board.data.weights} />
          ) : (
            <PageLoader variant="panel" />
          )}
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Lessons uploaded</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {facts?.metrics.lessons.done ?? 0}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              / {facts?.metrics.lessons.expected ?? 0}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Quizzes created</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {facts?.metrics.quizzes.created ?? 0}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              / {facts?.metrics.quizzes.target ?? 0} target
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Teacher attendance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {facts?.metrics.teacherAttendance.marked
                ? `${facts.metrics.teacherAttendance.present}/${facts.metrics.teacherAttendance.marked}`
                : "Not marked"}
            </p>
            {can("MANAGE_TEACHERS") ? (
              <Link href="/school/teachers/attendance" className="mt-1 block text-xs text-teal-800 hover:underline">
                Mark teacher attendance
              </Link>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Admin marks this separately</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Student attendance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{facts?.metrics.studentAttendance.rate ?? "—"}%</p>
            <p className="mt-1 text-xs text-muted-foreground">Discuss, do not blame the teacher first</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(facts?.byClass ?? []).map((row) => (
          <Card key={`${row.className}-${row.subject}`}>
            <CardHeader>
              <CardTitle className="text-base">
                {row.className} · {row.subject}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>
                {row.lessons} lessons · {row.quizzes} quizzes · {row.attempts}/{row.enrolled} students attempted
              </p>
              <p>
                Quiz avg {row.quizAverage ?? "—"}% · Term avg {row.termAverage ?? "—"}% · Student attendance{" "}
                {row.studentAttendance ?? "—"}%
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
