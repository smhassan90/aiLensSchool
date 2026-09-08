"use client";

import { PageLoader } from "@/components/layout/page-loader";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { lessonsService } from "@/services/lessons.service";
import { formatDate } from "@/lib/utils";
import { ApiClientError } from "@/lib/api-client";
import { useToast } from "@/providers/toast-provider";
import { BookOpen, Plus, Trash2 } from "lucide-react";

function statusVariant(status: string) {
  switch (status) {
    case "CONFIRMED":
      return "success" as const;
    case "READY_FOR_REVIEW":
    case "PENDING_REVIEW":
      return "warning" as const;
    default:
      return "secondary" as const;
  }
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function canReview(status: string) {
  return status === "READY_FOR_REVIEW" || status === "PENDING_REVIEW" || status === "DRAFT" || status === "CONFIRMED";
}

function canDeleteDraft(status: string) {
  return status !== "CONFIRMED";
}

export default function TeacherLessonsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["teacher-lessons"],
    queryFn: () => lessonsService.list({ limit: 50 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => lessonsService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-lessons"] });
      toast({ title: "Draft deleted", variant: "success" });
    },
    onError: (err) => {
      toast({
        title: "Could not delete lesson",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Today's Lessons"
        description="Upload photos of pages taught today. Only the extracted content is saved."
        actions={
          <Link href="/teacher/lessons/new">
            <Button>
              <Plus className="h-4 w-4" />
              {"Today's Lesson"}
            </Button>
          </Link>
        }
      />

      {isError && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <PageLoader variant="panel" task="lessons" />
        ) : !data?.items.length ? (
          <EmptyState
            icon={<BookOpen className="h-10 w-10" />}
            title="No lessons yet"
            description="Upload photos of the pages you taught to extract today’s lesson."
            action={
              <Link href="/teacher/lessons/new">
                <Button>{"Today's Lesson"}</Button>
              </Link>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Topic</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((lesson) => (
                <TableRow key={lesson.id}>
                  <TableCell>{formatDate(lesson.date)}</TableCell>
                  <TableCell>{lesson.subject?.name ?? "—"}</TableCell>
                  <TableCell>{lesson.section?.name ?? "—"}</TableCell>
                  <TableCell>{lesson.topicName ?? lesson.chapterName ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(lesson.status)}>{statusLabel(lesson.status)}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      {canReview(lesson.status) && (
                        <Link href={`/teacher/lessons/${lesson.id}/review`}>
                          <Button size="sm" variant="outline">
                            {lesson.status === "CONFIRMED" ? "Open" : "Review"}
                          </Button>
                        </Link>
                      )}
                      {canDeleteDraft(lesson.status) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={deleteMutation.isPending && deleteMutation.variables === lesson.id}
                          onClick={() => {
                            if (
                              !window.confirm(
                                "Delete this draft lesson? This cannot be undone.",
                              )
                            ) {
                              return;
                            }
                            deleteMutation.mutate(lesson.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete draft</span>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
