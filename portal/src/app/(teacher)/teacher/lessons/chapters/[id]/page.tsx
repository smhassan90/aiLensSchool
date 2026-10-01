"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { lessonsService } from "@/services/lessons.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import type { Lesson } from "@/lib/types";
import { useEffect, useState } from "react";
import { takePendingChapterPhotos } from "@/lib/chapter-pending-uploads";
import { ChapterPageManager } from "@/components/lessons/chapter-page-manager";
import { ChapterContentWorkflow } from "@/components/lessons/chapter-content-workflow";
import { ArrowLeft } from "lucide-react";

export default function ChapterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [chapterName, setChapterName] = useState("");
  const [topicName, setTopicName] = useState("");
  const [initialUploadFiles, setInitialUploadFiles] = useState<File[]>([]);

  const { data: lesson, isLoading } = useQuery({
    queryKey: ["lesson", id],
    queryFn: () => lessonsService.getById(id),
  });

  useEffect(() => {
    const pending = takePendingChapterPhotos(id);
    if (pending.length) setInitialUploadFiles(pending);
  }, [id]);

  useEffect(() => {
    if (!lesson) return;
    setChapterName(lesson.chapterName ?? "");
    setTopicName(lesson.topicName ?? "");
  }, [lesson]);

  const confirm = useMutation({
    mutationFn: (compiledFullText: string) =>
      lessonsService.confirmChapter(id, {
        chapterName: chapterName.trim(),
        topicName: topicName.trim(),
        contentText: compiledFullText,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lesson-chapters"] });
      toast({ title: "Chapter ready for class", variant: "success" });
      router.push("/teacher/lessons");
    },
    onError: (err) => {
      toast({
        title: "Could not confirm",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      });
    },
  });

  const refreshLesson = (updated: Lesson) => {
    queryClient.setQueryData(["lesson", id], updated);
  };

  if (isLoading || !lesson) {
    return <PageLoader variant="page" task="lesson-review" />;
  }

  const ready = Boolean(lesson.contentConfirmed);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={chapterName || "Chapter content"}
        description="Upload pages, read and edit the text, compile with AI, then approve."
        actions={
          <Link href="/teacher/lessons">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      <Badge className="mb-4" variant={ready ? "success" : "warning"}>
        {ready ? "Ready" : "Needs confirmation"}
      </Badge>

      <ChapterPageManager
        lessonId={id}
        pageSources={lesson.pageSources ?? []}
        initialUploadFiles={initialUploadFiles}
        onContentUpdated={(updated: Lesson) => {
          refreshLesson(updated);
        }}
      />

      <ChapterContentWorkflow
        lessonId={id}
        lesson={lesson}
        ready={ready}
        chapterName={chapterName}
        topicName={topicName}
        onChapterNameChange={setChapterName}
        onTopicNameChange={setTopicName}
        onLessonUpdated={refreshLesson}
        onConfirm={(text) => confirm.mutate(text)}
        confirmPending={confirm.isPending}
      />

      {ready && (
        <div className="flex flex-wrap justify-end gap-2">
          <Link href={`/teacher/lessons/today?type=NEW_LESSON&chapter=${id}`}>
            <Button>Log class with this chapter</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
