"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Users,
  Trophy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { PageLoader } from "@/components/layout/page-loader";
import { resultsService } from "@/services/results.service";
import { formatDateTime, quizQuestionTypeLabel } from "@/lib/utils";
import { cn } from "@/lib/utils";

const BAND_COLORS: Record<string, string> = {
  below40: "bg-rose-500",
  from40to59: "bg-amber-500",
  from60to79: "bg-sky-500",
  from80: "bg-emerald-500",
};

function scoreBadgeVariant(percentage: number | null) {
  if (percentage == null) return "outline" as const;
  if (percentage >= 80) return "success" as const;
  if (percentage >= 60) return "default" as const;
  if (percentage >= 40) return "warning" as const;
  return "destructive" as const;
}

export function QuizAnalysis({ quizId }: { quizId: string }) {
  const [search, setSearch] = useState("");
  const analysis = useQuery({
    queryKey: ["quiz-analysis", quizId],
    queryFn: () => resultsService.quizStats(quizId),
  });

  const data = analysis.data;
  const students = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!data || !term) return data?.students ?? [];
    return data.students.filter((row) =>
      `${row.firstName} ${row.lastName} ${row.studentCode}`.toLowerCase().includes(term),
    );
  }, [data, search]);

  if (analysis.isLoading) {
    return <PageLoader variant="panel" task="quiz" />;
  }

  if (analysis.isError || !data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Could not load quiz analysis.
      </div>
    );
  }

  if (data.totalStudentsAttempted === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="h-10 w-10" />}
        title="No attempts yet"
        description="Student scores and missed-question analysis will appear here after children submit this quiz."
      />
    );
  }

  const maxBand = Math.max(...data.scoreBands.map((band) => band.count), 1);
  const attention = data.questions.filter((q) => q.needsAttention);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Attempted</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {data.totalStudentsAttempted}
              <span className="text-base font-normal text-muted-foreground"> / {data.classSize}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.notAttemptedCount} not  submitted
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Class average</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{data.averagePercentage}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Highest</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-emerald-700">{data.highestPercentage}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Lowest</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-rose-700">{data.lowestPercentage}%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            How many children scored what
          </CardTitle>
          <CardDescription>Score bands for students who submitted the quiz</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.scoreBands.map((band) => (
            <div key={band.key} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{band.label}</span>
                <span className="text-muted-foreground">
                  {band.count} student{band.count === 1 ? "" : "s"}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", BAND_COLORS[band.key] ?? "bg-primary")}
                  style={{ width: `${(band.count / maxBand) * 100}%` }}
                />
              </div>
              {band.students.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {band.students.map((s) => s.name).join(", ")}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {attention.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              Review these in class
            </CardTitle>
            <CardDescription className="text-amber-800/80">
              At least half the class got these questions wrong. Revisit them before moving on.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {attention.map((q) => (
              <div key={q.id} className="rounded-md border border-amber-200 bg-white p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant="warning">Q{q.number}</Badge>
                  <Badge variant="outline">{quizQuestionTypeLabel(q.type)}</Badge>
                  <span className="text-sm font-semibold text-rose-700">
                    {q.missedPercent}% missed ({q.missedCount} of {data.totalStudentsAttempted})
                  </span>
                </div>
                <p className="text-sm">{q.questionText}</p>
                {q.correctAnswer && (
                  <p className="mt-1 text-xs text-muted-foreground">Right answer: {q.correctAnswer}</p>
                )}
                {q.missedBy.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Missed by: {q.missedBy.map((s) => s.name).join(", ")}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4" />
            Which student scored what
          </CardTitle>
          <CardDescription>Every child in the class, with their score</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search student"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>%</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((row) => (
                  <TableRow key={row.studentId}>
                    <TableCell className="font-medium">
                      {row.firstName} {row.lastName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.studentCode}</TableCell>
                    <TableCell>
                      {row.score == null ? "—" : `${row.score} / ${row.totalMarks}`}
                    </TableCell>
                    <TableCell>
                      <Badge variant={scoreBadgeVariant(row.percentage)}>
                        {row.percentage == null ? "Not submitted" : `${row.percentage}%`}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(row.submittedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4" />
            Question analysis
          </CardTitle>
          <CardDescription>
            Sorted by how often students got the question wrong
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.questions.map((q) => (
              <div
                key={q.id}
                className={cn(
                  "rounded-lg border p-4",
                  q.needsAttention && "border-amber-300 bg-amber-50/40",
                )}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant={q.needsAttention ? "warning" : "secondary"}>Q{q.number}</Badge>
                  <Badge variant="outline">{quizQuestionTypeLabel(q.type)}</Badge>
                  <span className="text-xs text-muted-foreground">{q.marks} mark{q.marks === 1 ? "" : "s"}</span>
                  {q.needsAttention && <Badge variant="warning">Review in class</Badge>}
                </div>
                <p className="text-sm font-medium">{q.questionText}</p>
                {q.correctAnswer && (
                  <p className="mt-1 text-xs text-muted-foreground">Right answer: {q.correctAnswer}</p>
                )}
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${q.correctPercent}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="text-emerald-700">{q.correctCount} correct</span>
                  <span className="text-rose-700">{q.wrongCount} wrong</span>
                  <span>{q.unansweredCount} unanswered</span>
                  <span className="font-medium text-foreground">{q.missedPercent}% missed</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
