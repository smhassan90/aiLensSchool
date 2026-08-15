"use client";

import { PageLoader } from "@/components/layout/page-loader";

import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { lessonsService } from "@/services/lessons.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

export default function ReviewLessonPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: lesson, isLoading, isError, error } = useQuery({
    queryKey: ["lesson", params.id],
    queryFn: () => lessonsService.getById(params.id),
    enabled: !!params.id,
  });

  const confirmMutation = useMutation({
    mutationFn: () => lessonsService.confirm(params.id),
    onSuccess: () => {
      toast({ title: "Lesson confirmed", description: "Lesson is now published.", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["teacher-lessons"] });
      router.push("/teacher/lessons");
    },
    onError: (err) => {
      toast({
        title: "Confirmation failed",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  if (isLoading) {
    return (
      <PageLoader variant="page" />
    );
  }

  if (isError || !lesson) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error)?.message ?? "Lesson not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <PageHeader
        title="Review Lesson"
        description="Review AI-processed content and confirm the lesson"
        actions={
          <Link href="/teacher/lessons">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      <div className="mx-auto max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{lesson.topicName ?? lesson.chapterName ?? "Lesson"}</CardTitle>
                <CardDescription>
                  {formatDate(lesson.date)} · {lesson.subject?.name} · Section {lesson.section?.name}
                </CardDescription>
              </div>
              <Badge variant={lesson.status === "CONFIRMED" ? "success" : "warning"}>
                {lesson.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {lesson.teacherNotes && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-muted-foreground">Teacher Notes</h4>
                <p className="text-sm">{lesson.teacherNotes}</p>
              </div>
            )}
            {lesson.aiSummary && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-muted-foreground">AI Summary</h4>
                <p className="text-sm leading-relaxed">{lesson.aiSummary}</p>
              </div>
            )}
            {lesson.aiKeyPoints && lesson.aiKeyPoints.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-muted-foreground">Key Points</h4>
                <ul className="list-inside list-disc space-y-1 text-sm">
                  {lesson.aiKeyPoints.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </div>
            )}
            {!lesson.aiSummary && !lesson.teacherNotes && (
              <p className="text-sm text-muted-foreground">No additional content to review.</p>
            )}
          </CardContent>
        </Card>

        {lesson.status !== "CONFIRMED" && (
          <div className="flex justify-end">
            <Button
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending}
            >
              <CheckCircle2 className="h-4 w-4" />
              {confirmMutation.isPending ? "Confirming…" : "Confirm Lesson"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
