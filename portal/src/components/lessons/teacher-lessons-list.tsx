"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { PageLoader } from "@/components/layout/page-loader";
import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { lessonsService } from "@/services/lessons.service";
import { ApiClientError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import type { Lesson } from "@/lib/types";
import { useToast } from "@/providers/toast-provider";
import { BookOpen } from "lucide-react";

function lessonTitle(lesson: Lesson): string {
  return lesson.chapterName?.trim() || lesson.topicName?.trim() || "Untitled chapter";
}

function classLabel(lesson: Lesson): string {
  const grade = lesson.grade?.name ?? lesson.section?.grade?.name;
  const section = lesson.section?.name;
  if (grade && section) return `${grade} ${section}`;
  return grade ?? section ?? "—";
}

function statusBadge(lesson: Lesson) {
  if (!lesson.contentConfirmed) {
    return <Badge variant="secondary">Draft</Badge>;
  }
  if (lesson.chapterProgress === "COMPLETED") {
    return <Badge variant="success">Completed</Badge>;
  }
  return <Badge variant="outline">In progress</Badge>;
}

function lessonHref(lesson: Lesson): string {
  return `/teacher/lessons/chapters/${lesson.id}`;
}

type Props = {
  lessons: Lesson[];
  isLoading: boolean;
};

export function TeacherLessonsList({ lessons, isLoading }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingDelete, setPendingDelete] = useState<Lesson | null>(null);

  const sorted = useMemo(
    () => [...lessons].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [lessons],
  );

  const deleteMutation = useMutation({
    mutationFn: (id: string) => lessonsService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lesson-chapters"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-lessons"] });
      toast({
        title: "Lesson deleted",
        description: "The chapter and its draft content were removed.",
        variant: "success",
      });
      setPendingDelete(null);
    },
    onError: (err) => {
      toast({
        title: "Could not delete lesson",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  if (isLoading) {
    return <PageLoader variant="panel" task="lessons" />;
  }

  if (!sorted.length) {
    return (
      <EmptyState
        icon={<BookOpen className="h-10 w-10" />}
        title="No lessons yet"
        description="Add chapter content from a textbook, then open it here to compile and confirm."
      />
    );
  }

  const pendingTitle = pendingDelete ? lessonTitle(pendingDelete) : "";

  return (
    <>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Chapter</TableHead>
              <TableHead className="hidden sm:table-cell">Class</TableHead>
              <TableHead className="hidden md:table-cell">Subject</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Updated</TableHead>
              <TableHead className="w-[72px] text-right"> </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((lesson) => (
              <TableRow
                key={lesson.id}
                className="cursor-pointer"
                onClick={() => router.push(lessonHref(lesson))}
              >
                <TableCell className="font-medium">
                  <div className="min-w-0">
                    <p className="truncate">{lessonTitle(lesson)}</p>
                    {lesson.topicName && lesson.chapterName && lesson.topicName !== lesson.chapterName ? (
                      <p className="truncate text-xs text-muted-foreground">{lesson.topicName}</p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{classLabel(lesson)}</TableCell>
                <TableCell className="hidden md:table-cell">{lesson.subject?.name ?? "—"}</TableCell>
                <TableCell>{statusBadge(lesson)}</TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {formatDate(lesson.date)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${lessonTitle(lesson)}`}
                    disabled={deleteMutation.isPending}
                    onClick={(event) => {
                      event.stopPropagation();
                      setPendingDelete(lesson);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent onClose={() => setPendingDelete(null)}>
          <DialogHeader>
            <DialogTitle>Delete this lesson?</DialogTitle>
            <DialogDescription>
              {pendingTitle ? (
                <>
                  <span className="font-medium text-foreground">{pendingTitle}</span> and its photos, draft text, and
                  compile work will be permanently removed. Class days linked to this chapter are not deleted.
                </>
              ) : (
                "This cannot be undone."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={deleteMutation.isPending}
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete lesson"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
