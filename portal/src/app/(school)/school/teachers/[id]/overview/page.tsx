"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { teachersService } from "@/services/teachers.service";
import { useAuth } from "@/providers/auth-provider";
import { ArrowLeft } from "lucide-react";
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

export default function TeacherOverviewPage() {
  const params = useParams<{ id: string }>();
  const { can } = useAuth();
  const allowed = can("VIEW_TEACHER_PROGRESS") || can("MANAGE_TEACHERS");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [classPick, setClassPick] = useState<{ sectionId: string; subjectId: string; label: string } | null>(null);
  const [quizId, setQuizId] = useState<string | null>(null);

  const overview = useQuery({
    queryKey: ["teacher-overview", params.id, month],
    queryFn: () => teachersService.overview(params.id, month),
    enabled: allowed && Boolean(params.id),
  });

  const insights = useQuery({
    queryKey: ["teacher-class-insights", params.id, classPick?.sectionId, classPick?.subjectId],
    queryFn: () =>
      teachersService.classInsights(params.id, classPick!.sectionId, classPick!.subjectId),
    enabled: Boolean(classPick),
  });

  const homeroom = useMemo(
    () => (overview.data?.assignments ?? []).filter((a) => a.role === "Class teacher"),
    [overview.data?.assignments],
  );
  const teaching = useMemo(
    () => (overview.data?.assignments ?? []).filter((a) => a.role !== "Class teacher"),
    [overview.data?.assignments],
  );

  if (!allowed) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <p className="text-sm text-muted-foreground">You do not have access to teacher overview.</p>
      </div>
    );
  }

  if (overview.isLoading || !overview.data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageLoader variant="page" phrases={["Loading teacher overview"]} />
      </div>
    );
  }

  const data = overview.data;
  const tz = data.timezone;
  const perf = data.performance;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={data.teacher.name}
        description={`Teacher 360 · ${data.teacher.employeeCode}${data.teacher.branchName ? ` · ${data.teacher.branchName}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/school/teachers">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4" />
                All teachers
              </Button>
            </Link>
            {can("MANAGE_TEACHERS") ? (
              <Link href={`/school/teachers/${params.id}`}>
                <Button variant="outline">Edit profile</Button>
              </Link>
            ) : null}
            <Link href={`/school/teachers/${params.id}/progress`}>
              <Button variant="outline">AI progress</Button>
            </Link>
          </div>
        }
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
                    return (
                      <li key={row.id}>
                        {canDrill ? (
                          <button
                            type="button"
                            className="text-left text-primary underline-offset-2 hover:underline"
                            onClick={() =>
                              setClassPick({
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
            Click a row to see lessons, quizzes, and class averages. Score snapshot: {perf.total}/100.
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
                  {perf.byClass.map((cls) => (
                    <TableRow
                      key={`${cls.sectionId}-${cls.subjectId}`}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        setClassPick({
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
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(classPick)} onOpenChange={(open) => !open && setClassPick(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{classPick?.label}</DialogTitle>
          </DialogHeader>
          {insights.isLoading ? (
            <PageLoader variant="panel" />
          ) : insights.data ? (
            <div className="space-y-6">
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
                          className={cn("cursor-pointer hover:bg-muted/50")}
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
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(quizId)} onOpenChange={(open) => !open && setQuizId(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Quiz breakdown</DialogTitle>
          </DialogHeader>
          {quizId ? <QuizAnalysis quizId={quizId} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
