"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { teachersService } from "@/services/teachers.service";
import { ChevronLeft } from "lucide-react";
import { QuizAnalysis } from "@/components/quizzes/quiz-analysis";
import { cn } from "@/lib/utils";

function statusBadge(status: string) {
  const s = status?.toUpperCase();
  if (s === "PRESENT") return <Badge variant="success">Present</Badge>;
  if (s === "LATE") return <Badge variant="warning">Late</Badge>;
  if (s === "ABSENT") return <Badge variant="destructive">Absent</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function formatTime(iso: string | null, timeZone: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

export function Teacher360View({
  teacherId,
  headerActions,
}: {
  teacherId: string;
  headerActions?: ReactNode;
}) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [classPick, setClassPick] = useState<{ sectionId: string; subjectId: string; label: string } | null>(null);
  const [quizId, setQuizId] = useState<string | null>(null);
  const classDetailRef = useRef<HTMLDivElement>(null);
  const quizDetailRef = useRef<HTMLDivElement>(null);

  const overview = useQuery({
    queryKey: ["teacher-overview", teacherId, month],
    queryFn: () => teachersService.overview(teacherId, month),
    enabled: Boolean(teacherId),
  });

  const insights = useQuery({
    queryKey: ["teacher-class-insights", teacherId, classPick?.sectionId, classPick?.subjectId],
    queryFn: () =>
      teachersService.classInsights(teacherId, classPick!.sectionId, classPick!.subjectId),
    enabled: Boolean(classPick),
  });

  const selectClass = (pick: { sectionId: string; subjectId: string; label: string }) => {
    setQuizId(null);
    setClassPick(pick);
  };

  const clearClass = () => {
    setQuizId(null);
    setClassPick(null);
  };

  useEffect(() => {
    if (classPick && classDetailRef.current) {
      classDetailRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [classPick]);

  useEffect(() => {
    if (quizId && quizDetailRef.current) {
      quizDetailRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [quizId]);

  const homeroom = useMemo(
    () => (overview.data?.assignments ?? []).filter((a) => a.role === "Class teacher"),
    [overview.data?.assignments],
  );
  const teaching = useMemo(
    () => (overview.data?.assignments ?? []).filter((a) => a.role !== "Class teacher"),
    [overview.data?.assignments],
  );

  if (overview.isLoading || !overview.data) {
    return <PageLoader variant="page" phrases={["Loading teacher overview"]} />;
  }

  const data = overview.data;
  const tz = data.timezone;
  const perf = data.performance;
  const selectedQuizTitle =
    quizId && insights.data?.quizzes.find((q) => q.id === quizId)?.title;

  return (
    <>
      <PageHeader
        title={data.teacher.name}
        description={[
          "Teacher 360",
          data.teacher.employeeCode,
          data.teacher.username ? `Username ${data.teacher.username}` : null,
          data.teacher.branchName,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={headerActions}
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Role on campus</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {homeroom.length ? (
              <div>
                <p className="font-medium text-muted-foreground">Class teacher</p>
                <ul className="mt-1 list-disc pl-5">
                  {homeroom.map((row) => (
                    <li key={row.id}>
                      {row.className}
                      {row.sectionName ? ` (${row.sectionName})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-muted-foreground">Not a class teacher.</p>
            )}
            {teaching.length ? (
              <div>
                <p className="font-medium text-muted-foreground">Teaches</p>
                <ul className="mt-1 space-y-1">
                  {teaching.map((row) => {
                    const canDrill = row.sectionId && row.subjectId;
                    const label = `${row.className}${row.subject ? ` · ${row.subject}` : ""}`;
                    const isSelected =
                      classPick?.sectionId === row.sectionId && classPick?.subjectId === row.subjectId;
                    return (
                      <li key={row.id}>
                        {canDrill ? (
                          <button
                            type="button"
                            className={cn(
                              "text-left underline-offset-2 hover:underline",
                              isSelected ? "font-semibold text-primary" : "text-primary",
                            )}
                            onClick={() =>
                              selectClass({
                                sectionId: row.sectionId!,
                                subjectId: row.subjectId!,
                                label,
                              })
                            }
                          >
                            <span className="font-medium">{row.className}</span>
                            {row.subject ? (
                              <span className="text-muted-foreground"> · {row.subject}</span>
                            ) : null}
                          </button>
                        ) : (
                          <>
                            <span className="font-medium">{row.className}</span>
                            {row.subject ? (
                              <span className="text-muted-foreground"> · {row.subject}</span>
                            ) : null}
                          </>
                        )}
                        <span className="text-muted-foreground"> · {row.role}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="text-muted-foreground">No subject classes assigned yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attendance this month</CardTitle>
            <CardDescription>
              <Label className="sr-only" htmlFor="month">Month</Label>
              <Input
                id="month"
                type="month"
                className="mt-2 max-w-[200px]"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-2 text-sm">
              <Badge variant="success">{data.attendanceMonth.summary.present} present</Badge>
              <Badge variant="warning">{data.attendanceMonth.summary.late} late</Badge>
              <Badge variant="destructive">{data.attendanceMonth.summary.absent} absent</Badge>
            </div>
            {data.attendanceMonth.days.length === 0 ? (
              <p className="text-sm text-muted-foreground">No attendance records this month.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>In</TableHead>
                      <TableHead>Out</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.attendanceMonth.days.map((day) => (
                      <TableRow key={day.date}>
                        <TableCell>{day.date}</TableCell>
                        <TableCell>{formatTime(day.checkInTime, tz)}</TableCell>
                        <TableCell>{formatTime(day.checkOutTime, tz)}</TableCell>
                        <TableCell>{statusBadge(day.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Classes &amp; results (recent term)</CardTitle>
          <CardDescription>
            Select a class below to see lessons, quizzes, and averages on this page. Score snapshot:{" "}
            {perf.total}/100.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!perf.byClass.length ? (
            <p className="text-sm text-muted-foreground">No teaching assignments with quiz data yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Lessons</TableHead>
                    <TableHead>Quizzes</TableHead>
                    <TableHead>Quiz avg</TableHead>
                    <TableHead>Term avg</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {perf.byClass.map((cls) => {
                    const selected =
                      classPick?.sectionId === cls.sectionId && classPick?.subjectId === cls.subjectId;
                    return (
                      <TableRow
                        key={`${cls.sectionId}-${cls.subjectId}`}
                        className={cn(
                          "cursor-pointer hover:bg-muted/50",
                          selected && "bg-primary/10 hover:bg-primary/15",
                        )}
                        onClick={() =>
                          selectClass({
                            sectionId: cls.sectionId,
                            subjectId: cls.subjectId,
                            label: `${cls.className} · ${cls.subject}`,
                          })
                        }
                      >
                        <TableCell className="font-medium">{cls.className}</TableCell>
                        <TableCell>{cls.subject}</TableCell>
                        <TableCell>{cls.lessons}</TableCell>
                        <TableCell>{cls.quizzes}</TableCell>
                        <TableCell>{cls.quizAverage ?? "—"}%</TableCell>
                        <TableCell>{cls.termAverage ?? "—"}%</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {classPick ? (
        <div ref={classDetailRef} className="mb-6 scroll-mt-6 space-y-6">
          <Card className="border-primary/30">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base">{classPick.label}</CardTitle>
                <CardDescription>Lessons and quizzes for this class</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={clearClass}>
                Clear selection
              </Button>
            </CardHeader>
            <CardContent>
              {insights.isLoading ? (
                <PageLoader variant="panel" />
              ) : insights.data ? (
                <div className="space-y-8">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Lessons uploaded</h3>
                    {!insights.data.lessons.length ? (
                      <p className="text-sm text-muted-foreground">No lessons yet.</p>
                    ) : (
                      <ul className="space-y-1 text-sm">
                        {insights.data.lessons.map((lesson) => (
                          <li key={lesson.id} className="flex justify-between gap-2 border-b py-1">
                            <span>{lesson.title}</span>
                            <span className="text-muted-foreground">{lesson.date}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Quizzes &amp; class averages</h3>
                    {!insights.data.quizzes.length ? (
                      <p className="text-sm text-muted-foreground">No quizzes yet.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Quiz</TableHead>
                              <TableHead>Attempts</TableHead>
                              <TableHead>Average</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {insights.data.quizzes.map((quiz) => (
                              <TableRow
                                key={quiz.id}
                                className={cn(
                                  "cursor-pointer hover:bg-muted/50",
                                  quizId === quiz.id && "bg-primary/10 hover:bg-primary/15",
                                )}
                                onClick={() => setQuizId(quiz.id)}
                              >
                                <TableCell className="font-medium">{quiz.title}</TableCell>
                                <TableCell>{quiz.attempts}</TableCell>
                                <TableCell>
                                  {quiz.averageScore != null ? `${quiz.averageScore}%` : "—"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {quizId ? (
            <div ref={quizDetailRef} className="scroll-mt-6">
              <Card className="border-primary/30">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-base">Quiz breakdown</CardTitle>
                    <CardDescription>
                      {selectedQuizTitle ?? "Question-level results for this class"}
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setQuizId(null)}>
                    <ChevronLeft className="h-4 w-4" />
                    Back to class
                  </Button>
                </CardHeader>
                <CardContent>
                  <QuizAnalysis quizId={quizId} />
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
