"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { lessonsService } from "@/services/lessons.service";
import { teachersService } from "@/services/teachers.service";
import { formatDate } from "@/lib/utils";
import { BookOpen, CalendarCheck, Library, PieChart } from "lucide-react";

export default function TeacherLessonsHubPage() {
  const classes = useQuery({
    queryKey: ["teacher-classes"],
    queryFn: () => teachersService.myClasses(),
  });

  const primary = classes.data?.[0];
  const classKey = primary ? `${primary.sectionId}:${primary.subjectId}` : "";

  const chapters = useQuery({
    queryKey: ["lesson-chapters", primary?.sectionId, primary?.subjectId],
    queryFn: () =>
      lessonsService.listChapters({
        sectionId: primary!.sectionId,
        subjectId: primary!.subjectId,
        limit: 20,
      }),
    enabled: Boolean(primary?.sectionId && primary?.subjectId),
  });

  const sessions = useQuery({
    queryKey: ["teacher-lessons", "sessions"],
    queryFn: () => lessonsService.list({ limit: 10, recordKind: "CLASS_SESSION" }),
  });

  const inProgress = (chapters.data ?? []).find(
    (c) => c.contentConfirmed && c.chapterProgress !== "COMPLETED",
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Lessons"
        description="Save chapter content once, then log each class day and homework separately."
      />

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <Link href="/teacher/lessons/today">
          <Card className="h-full transition-colors hover:border-primary/40">
            <CardHeader>
              <CalendarCheck className="mb-2 h-8 w-8 text-primary" />
              <CardTitle>Today in class</CardTitle>
              <CardDescription>New lesson, continuation, or revision — and optional homework.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/teacher/lessons/chapters/new">
          <Card className="h-full transition-colors hover:border-primary/40">
            <CardHeader>
              <Library className="mb-2 h-8 w-8 text-primary" />
              <CardTitle>Add chapter content</CardTitle>
              <CardDescription>Photograph pages or paste from the book. Confirm once per chapter.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href={classKey ? `/teacher/lessons/pace?class=${encodeURIComponent(classKey)}` : "/teacher/lessons/pace"}>
          <Card className="h-full transition-colors hover:border-primary/40">
            <CardHeader>
              <PieChart className="mb-2 h-8 w-8 text-primary" />
              <CardTitle>Subject pace</CardTitle>
              <CardDescription>See how class time is spread across chapters.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>

      {inProgress && (
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium">Continue where you left off</p>
              <p className="text-sm text-muted-foreground">
                {inProgress.chapterName ?? inProgress.topicName ?? "Chapter"} · In progress
              </p>
            </div>
            <Link
              href={`/teacher/lessons/today?type=CONTINUATION&chapter=${inProgress.id}${classKey ? `&class=${encodeURIComponent(classKey)}` : ""}`}
            >
              <Button>Log today&apos;s class</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Chapter library</CardTitle>
              <CardDescription>Confirmed content you can reuse.</CardDescription>
            </div>
            <Link href="/teacher/lessons/chapters/new">
              <Button size="sm" variant="outline">Add</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {chapters.isLoading ? (
              <PageLoader variant="panel" task="lessons" />
            ) : !chapters.data?.length ? (
              <p className="text-sm text-muted-foreground">No chapters yet. Add one chapter at a time (~3 pages).</p>
            ) : (
              <ul className="space-y-2">
                {chapters.data.map((ch) => (
                  <li key={ch.id}>
                    <Link
                      href={`/teacher/lessons/chapters/${ch.id}`}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
                    >
                      <span>{ch.chapterName ?? ch.topicName ?? "Chapter"}</span>
                      <Badge variant={ch.contentConfirmed ? "success" : "warning"}>
                        {ch.contentConfirmed ? "Ready" : "Confirm content"}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent class days</CardTitle>
          </CardHeader>
          <CardContent>
            {sessions.isLoading ? (
              <PageLoader variant="panel" task="lessons" />
            ) : !sessions.data?.items.length ? (
              <p className="text-sm text-muted-foreground">No class days logged yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {sessions.data.items.map((row) => (
                  <li key={row.id} className="flex justify-between gap-2 border-b border-border/60 pb-2">
                    <span>
                      {formatDate(row.date)} · {row.sessionType?.replace("_", " ") ?? "Class"}
                      {row.chapterName ? ` · ${row.chapterName}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
        <BookOpen className="h-4 w-4" />
        Legacy upload flow is replaced: use chapter library + today in class.
      </p>
    </div>
  );
}
