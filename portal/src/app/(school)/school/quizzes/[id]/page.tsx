"use client";

import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { quizzesService } from "@/services/quizzes.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { ArrowLeft, Send } from "lucide-react";

export default function SchoolQuizDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dueAt, setDueAt] = useState("");

  const { data: quiz, isLoading, isError, error } = useQuery({
    queryKey: ["quiz", params.id],
    queryFn: () => quizzesService.getById(params.id),
    enabled: !!params.id,
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!quiz?.questions) return Promise.reject(new Error("No questions"));
      return quizzesService.updateQuestions(
        params.id,
        quiz.questions.map((q) => ({
          id: q.id,
          included: q.included,
          questionText: q.questionText,
          marks: q.marks,
        })),
      );
    },
    onSuccess: () => {
      toast({ title: "Questions saved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["quiz", params.id] });
    },
    onError: (err) => {
      toast({
        title: "Save failed",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  const publishMutation = useMutation({
    mutationFn: () =>
      quizzesService.publish(params.id, dueAt ? new Date(dueAt).toISOString() : undefined),
    onSuccess: () => {
      toast({ title: "Quiz published", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["quiz", params.id] });
      queryClient.invalidateQueries({ queryKey: ["quizzes"] });
      router.push("/school/quizzes");
    },
    onError: (err) => {
      toast({
        title: "Publish failed",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  const toggleQuestion = (questionId: string) => {
    if (!quiz?.questions) return;
    queryClient.setQueryData(["quiz", params.id], {
      ...quiz,
      questions: quiz.questions.map((q) =>
        q.id === questionId ? { ...q, included: !q.included } : q,
      ),
    });
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="mx-auto h-96 max-w-4xl" />
      </div>
    );
  }

  if (isError || !quiz) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error)?.message ?? "Quiz not found"}
        </div>
      </div>
    );
  }

  const includedCount = quiz.questions?.filter((q) => q.included).length ?? 0;

  return (
    <div className="p-8">
      <PageHeader
        title={quiz.title}
        description={`${quiz.subject?.name ?? ""} · Section ${quiz.section?.name ?? ""}`}
        actions={
          <Link href="/school/quizzes">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-3">
          <Badge variant={quiz.status === "PUBLISHED" ? "success" : "warning"}>
            {quiz.status}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {includedCount} of {quiz.questions?.length ?? 0} questions included
          </span>
        </div>

        <Tabs defaultValue="questions">
          <TabsList>
            <TabsTrigger value="questions">Questions</TabsTrigger>
            <TabsTrigger value="publish">Publish</TabsTrigger>
          </TabsList>

          <TabsContent value="questions">
            <div className="space-y-4">
              {quiz.questions?.map((q, index) => (
                <Card key={q.id} className={!q.included ? "opacity-60" : undefined}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-4">
                      <CardTitle className="text-base font-medium">
                        Q{index + 1}. {q.questionText}
                      </CardTitle>
                      {quiz.status !== "PUBLISHED" && (
                        <Button
                          size="sm"
                          variant={q.included ? "default" : "outline"}
                          onClick={() => toggleQuestion(q.id)}
                        >
                          {q.included ? "Included" : "Excluded"}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    <span className="mr-4">Type: {q.type}</span>
                    <span>Marks: {q.marks}</span>
                    {q.options && q.options.length > 0 && (
                      <ul className="mt-2 list-inside list-disc">
                        {q.options.map((opt, i) => (
                          <li key={i}>{typeof opt === "string" ? opt : String(opt)}</li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            {quiz.status !== "PUBLISHED" && (
              <div className="mt-6 flex justify-end">
                <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="publish">
            <Card>
              <CardHeader>
                <CardTitle>Publish Quiz</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="dueAt">Due Date (optional)</Label>
                  <Input
                    id="dueAt"
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Publishing will make this quiz available to students in the selected section.
                  {includedCount === 0 && " Warning: no questions are included."}
                </p>
                <Button
                  onClick={() => publishMutation.mutate()}
                  disabled={publishMutation.isPending || quiz.status === "PUBLISHED" || includedCount === 0}
                >
                  <Send className="h-4 w-4" />
                  {publishMutation.isPending ? "Publishing…" : "Publish Quiz"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
