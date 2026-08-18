"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuizReviewQuestion } from "@/components/quizzes/quiz-review-question";
import { QuizEditorActions } from "@/components/quizzes/quiz-editor-actions";
import { QuizAnalysis } from "@/components/quizzes/quiz-analysis";
import { quizzesService } from "@/services/quizzes.service";

interface QuizDetailViewProps {
  quizId: string;
  listHref: string;
  listQueryKey: unknown[];
}

export function QuizDetailView({ quizId, listHref, listQueryKey }: QuizDetailViewProps) {
  const queryClient = useQueryClient();

  const { data: quiz, isLoading, isError, error } = useQuery({
    queryKey: ["quiz", quizId],
    queryFn: () => quizzesService.getById(quizId),
    enabled: !!quizId,
  });

  const toggleQuestion = (questionId: string) => {
    if (!quiz?.questions) return;
    queryClient.setQueryData(["quiz", quizId], {
      ...quiz,
      questions: quiz.questions.map((q) =>
        q.id === questionId ? { ...q, included: !q.included } : q,
      ),
    });
  };

  if (isLoading) {
    return <PageLoader variant="page" />;
  }

  if (isError || !quiz) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error)?.message ?? "Quiz not found"}
        </div>
      </div>
    );
  }

  const includedCount = quiz.questions?.filter((q) => q.included).length ?? 0;
  const isDraft = quiz.status !== "PUBLISHED";

  const questions = (
    <div className="space-y-4">
      {quiz.questions?.map((q, index) => (
        <QuizReviewQuestion
          key={q.id}
          question={q}
          index={index}
          dimmed={!q.included}
          action={
            isDraft ? (
              <Button
                size="sm"
                variant={q.included ? "default" : "outline"}
                onClick={() => toggleQuestion(q.id)}
              >
                {q.included ? "Included" : "Excluded"}
              </Button>
            ) : undefined
          }
        />
      ))}
    </div>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={quiz.title}
        description={`${quiz.subject?.name ?? ""} · Section ${quiz.section?.name ?? ""}`}
        actions={
          <Link href={listHref}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      <div className="min-w-0 space-y-6">
        <div className="flex items-center gap-3">
          <Badge variant={quiz.status === "PUBLISHED" ? "success" : "warning"}>
            {quiz.status}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {includedCount} of {quiz.questions?.length ?? 0} questions included
          </span>
        </div>

        {isDraft ? (
          <>
            {questions}
            <QuizEditorActions
              quizId={quizId}
              quiz={quiz}
              listHref={listHref}
              listQueryKey={listQueryKey}
            />
          </>
        ) : (
          <Tabs defaultValue="analysis">
            <TabsList>
              <TabsTrigger value="analysis">Analysis</TabsTrigger>
              <TabsTrigger value="questions">Questions</TabsTrigger>
            </TabsList>
            <TabsContent value="analysis">
              <QuizAnalysis quizId={quizId} />
            </TabsContent>
            <TabsContent value="questions">{questions}</TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
