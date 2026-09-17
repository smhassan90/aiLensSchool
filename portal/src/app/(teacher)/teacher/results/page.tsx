"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { PageLoader } from "@/components/layout/page-loader";
import { resultsService } from "@/services/results.service";
import { formatDate } from "@/lib/utils";
import { Trophy } from "lucide-react";

export default function TeacherResultsPage() {
  const [search, setSearch] = useState("");
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const results = useQuery({ queryKey: ["results"], queryFn: () => resultsService.list({ limit: 100 }) });
  const detail = useQuery({
    queryKey: ["result-detail", selectedResultId],
    queryFn: () => resultsService.detail(selectedResultId!),
    enabled: Boolean(selectedResultId),
  });
  const items = (results.data?.items ?? []).filter((row) => {
    const name = `${row.student?.firstName ?? ""} ${row.student?.lastName ?? ""} ${row.quiz?.title ?? ""}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Quiz scores"
        description="How students did on quizzes you published"
        actions={
          <Link href="/teacher/marks">
            <Button variant="outline">Tests & reports</Button>
          </Link>
        }
      />
      <div className="mb-4 max-w-md">
        <Input placeholder="Search student or quiz" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="rounded-lg border bg-card">
        {results.isLoading ? (
          <PageLoader variant="panel" />
        ) : !items.length ? (
          <EmptyState icon={<Trophy className="h-10 w-10" />} title="No results" description="Published quizzes will appear here after attempts." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Quiz</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedResultId(row.id)}
                >
                  <TableCell>{row.student ? `${row.student.firstName} ${row.student.lastName}` : "—"}</TableCell>
                  <TableCell>{row.quiz?.title ?? "—"}</TableCell>
                  <TableCell><Badge>{Number(row.percentage)}%</Badge></TableCell>
                  <TableCell>{formatDate(row.submittedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      {detail.data ? (
        <div className="mt-6 rounded-lg border bg-card p-4 sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {detail.data.quiz.title} — question paper
              </h2>
              <p className="text-sm text-muted-foreground">
                {detail.data.student.firstName} {detail.data.student.lastName} ·{" "}
                {detail.data.student.studentCode} · {detail.data.score}/{detail.data.totalMarks} (
                {detail.data.percentage}%)
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSelectedResultId(null)}>
              Close
            </Button>
          </div>
          <div className="space-y-4">
            {detail.data.questions.map((question) => (
              <div key={question.id} className="rounded-md border p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">Q{question.number}. {question.questionText}</p>
                  <Badge variant={
                    question.isCorrect === true
                      ? "success"
                      : question.isCorrect === false
                        ? "destructive"
                        : "outline"
                  }>
                    {question.isCorrect === true
                      ? "Correct"
                      : question.isCorrect === false
                        ? "Incorrect"
                        : "Not answered"}
                  </Badge>
                </div>
                {question.options.length ? (
                  <div className="space-y-1 text-sm">
                    {question.options.map((option) => (
                      <p
                        key={option.id}
                        className={`rounded px-2 py-1 ${
                          option.id === question.selectedOptionId
                            ? option.isCorrect
                              ? "bg-emerald-100 text-emerald-900"
                              : "bg-rose-100 text-rose-900"
                            : option.isCorrect
                              ? "bg-emerald-50 text-emerald-800"
                              : ""
                        }`}
                      >
                        {option.text}
                        {option.id === question.selectedOptionId ? " · Student selected" : ""}
                        {option.isCorrect ? " · Correct answer" : ""}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Student answer: {question.selectedAnswer ?? "Not answered"}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Marks: {question.marksAwarded ?? 0}/{question.marks}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : detail.isLoading ? (
        <div className="mt-6"><PageLoader variant="panel" task="quizzes" /></div>
      ) : null}
    </div>
  );
}
