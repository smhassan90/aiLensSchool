"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { lessonsService } from "@/services/lessons.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { coerceLessonDisplayText } from "@/lib/lesson-display-text";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

export default function ChapterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [chapterName, setChapterName] = useState("");
  const [topicName, setTopicName] = useState("");
  const [contentText, setContentText] = useState("");

  const { data: lesson, isLoading } = useQuery({
    queryKey: ["lesson", id],
    queryFn: () => lessonsService.getById(id),
  });

  useEffect(() => {
    if (!lesson) return;
    setChapterName(lesson.chapterName ?? "");
    setTopicName(lesson.topicName ?? "");
    setContentText(coerceLessonDisplayText(lesson.extractedText ?? lesson.aiSummary ?? ""));
  }, [lesson]);

  const saveDraft = useMutation({
    mutationFn: () =>
      lessonsService.update(id, {
        chapterName: chapterName.trim(),
        topicName: topicName.trim(),
        extractedText: contentText,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lesson", id] });
      toast({ title: "Saved", variant: "success" });
    },
    onError: (err) => {
      toast({
        title: "Could not save",
        description: err instanceof ApiClientError ? err.message : "",
        variant: "error",
      });
    },
  });

  const confirm = useMutation({
    mutationFn: () =>
      lessonsService.confirmChapter(id, {
        chapterName: chapterName.trim(),
        topicName: topicName.trim(),
        contentText,
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

  const complete = useMutation({
    mutationFn: () => lessonsService.completeChapter(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lesson-chapters"] });
      toast({ title: "Chapter marked completed", variant: "success" });
    },
  });

  if (isLoading || !lesson) {
    return <PageLoader variant="page" task="lesson-review" />;
  }

  const isRtl = /[\u0600-\u06FF]/.test(contentText);
  const ready = lesson.contentConfirmed;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={chapterName || "Chapter content"}
        description="Is this almost what is on the pages? Fix small mistakes, then confirm."
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

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Content</CardTitle>
          <CardDescription>Only the text is saved for homework and class logs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Chapter</Label>
              <Input value={chapterName} onChange={(e) => setChapterName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Topic</Label>
              <Input value={topicName} onChange={(e) => setTopicName(e.target.value)} />
            </div>
          </div>
          <Textarea
            rows={20}
            dir={isRtl ? "rtl" : "ltr"}
            className="min-h-[20rem] font-sans leading-relaxed"
            value={contentText}
            onChange={(e) => setContentText(e.target.value)}
          />
          <div className="flex flex-wrap gap-2 justify-end">
            {!ready && (
              <>
                <Button variant="outline" onClick={() => router.push("/teacher/lessons/chapters/new")}>
                  Wrong — try again
                </Button>
                <Button
                  variant="outline"
                  disabled={saveDraft.isPending}
                  onClick={() => saveDraft.mutate()}
                >
                  Save draft
                </Button>
                <Button
                  disabled={confirm.isPending || !contentText.trim()}
                  onClick={() => confirm.mutate()}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Looks right — save to library
                </Button>
              </>
            )}
            {ready && (
              <>
                <Button variant="outline" disabled={saveDraft.isPending} onClick={() => saveDraft.mutate()}>
                  Save edits
                </Button>
                <Link href={`/teacher/lessons/today?type=NEW_LESSON&chapter=${id}`}>
                  <Button>Log class with this chapter</Button>
                </Link>
                {lesson.chapterProgress !== "COMPLETED" && (
                  <Button variant="secondary" onClick={() => complete.mutate()}>
                    Mark chapter finished
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
