"use client";



import Link from "next/link";

import { useEffect, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ArrowLeft, Printer } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";

import { PageLoader } from "@/components/layout/page-loader";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { QuizReviewQuestion } from "@/components/quizzes/quiz-review-question";

import { QuizEditorActions } from "@/components/quizzes/quiz-editor-actions";

import { ExamQuestionEditor } from "@/components/quizzes/exam-question-editor";

import { QuizAnalysis } from "@/components/quizzes/quiz-analysis";

import { ExamPrintView } from "@/components/exams/exam-print-view";

import { ExamSolutionSheet } from "@/components/exams/exam-solution-sheet";

import { quizzesService } from "@/services/quizzes.service";

import {
  canPrintTeacherExamPaper,
  examPaperLabel,
  examStatusLabel,
  isExamPaper,
  teacherExamPaperStatus,
  teacherExamPaperStatusLabel,
  teacherExamPaperStatusVariant,
} from "@/lib/exam-paper";

import { difficultyColorClass, difficultyDescription, difficultyLabel } from "@/lib/difficulty";

import { personFullName } from "@/lib/person-name";



interface QuizDetailViewProps {
  quizId: string;
  listHref: string;
  listQueryKey: unknown[];
  variant?: "teacher" | "admin";
}

export function QuizDetailView({ quizId, listHref, listQueryKey, variant = "admin" }: QuizDetailViewProps) {

  const queryClient = useQueryClient();

  const [printSolution, setPrintSolution] = useState(false);



  const { data: quiz, isLoading, isError, error } = useQuery({

    queryKey: ["quiz", quizId],

    queryFn: () => quizzesService.getById(quizId),

    enabled: !!quizId,

  });



  useEffect(() => {

    const reset = () => setPrintSolution(false);

    window.addEventListener("afterprint", reset);

    return () => window.removeEventListener("afterprint", reset);

  }, []);



  const toggleQuestion = (questionId: string) => {

    if (!quiz?.questions) return;

    queryClient.setQueryData(["quiz", quizId], {

      ...quiz,

      questions: quiz.questions.map((q) =>

        q.id === questionId ? { ...q, included: !q.included } : q,

      ),

    });

  };



  const updateQuiz = (next: NonNullable<typeof quiz>) => {

    queryClient.setQueryData(["quiz", quizId], next);

  };



  const print = (solution: boolean) => {

    setPrintSolution(solution);

    requestAnimationFrame(() => window.print());

  };



  if (isLoading) {

    return <PageLoader variant="page" task="quiz" />;

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

  const examPaper = isExamPaper(quiz.paperKind);
  const isDraft = quiz.status === "DRAFT";
  const paperStatus = examPaper ? teacherExamPaperStatus(quiz) : null;
  const canPrint = examPaper ? canPrintTeacherExamPaper(quiz) : false;
  const isPending = paperStatus === "PENDING";



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

    <div className="p-4 sm:p-6 lg:p-8 print:p-0">

      <div className="print:hidden">

        <PageHeader

          title={quiz.title}

          description={

            examPaper

              ? `${examPaperLabel(quiz.paperKind)} · ${quiz.subject?.name ?? ""} · Section ${quiz.section?.name ?? ""}`

              : `${quiz.subject?.name ?? ""} · Section ${quiz.section?.name ?? ""} · Headline suggested by the system`

          }

          actions={

            <div className="flex flex-wrap gap-2">

              {examPaper && canPrint ? (
                <>
                  <Button variant="outline" onClick={() => print(false)}>
                    <Printer className="h-4 w-4" />
                    Print paper
                  </Button>
                  <Button variant="outline" onClick={() => print(true)}>
                    <Printer className="h-4 w-4" />
                    Print answer key
                  </Button>
                </>
              ) : null}

              <Link href={listHref}>

                <Button variant="outline">

                  <ArrowLeft className="h-4 w-4" />

                  Back

                </Button>

              </Link>

            </div>

          }

        />



        <div className="mt-6 flex flex-wrap items-center gap-3">

          <Badge
            variant={
              examPaper && paperStatus
                ? teacherExamPaperStatusVariant(paperStatus)
                : quiz.status === "PUBLISHED" || quiz.status === "CLOSED"
                  ? "success"
                  : "warning"
            }
          >
            {examPaper && paperStatus
              ? teacherExamPaperStatusLabel(paperStatus)
              : examPaper
                ? examStatusLabel(quiz.status, quiz.paperKind, quiz.reviewStatus)
                : quiz.status}
          </Badge>

          {examPaper && quiz.difficulty ? (

            <span

              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${difficultyColorClass(quiz.difficulty)}`}

            >

              Difficulty {difficultyLabel(quiz.difficulty)} · {difficultyDescription(quiz.difficulty)}

            </span>

          ) : null}

          {quiz.createdBy ? (

            <span className="text-sm text-muted-foreground">

              {personFullName(quiz.createdBy.firstName, quiz.createdBy.lastName)}

            </span>

          ) : null}

          <span className="text-sm text-muted-foreground">
            {includedCount} of {quiz.questions?.length ?? 0} questions included
          </span>
        </div>

        {examPaper && paperStatus ? (
          <div
            className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
              paperStatus === "APPROVED"
                ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                : paperStatus === "PENDING"
                  ? "border-amber-200 bg-amber-50 text-amber-950"
                  : paperStatus === "DRAFT" && quiz.rejectionReason
                    ? "border-amber-200 bg-amber-50 text-amber-950"
                    : "border-border bg-muted/30 text-muted-foreground"
            }`}
          >
            {paperStatus === "DRAFT" && (
              <p>
                {quiz.rejectionReason
                  ? `Returned to draft. Office feedback: ${quiz.rejectionReason}`
                  : "Draft — make changes and submit when the paper is ready."}
              </p>
            )}
            {paperStatus === "PENDING" && (
              <p>Pending approval — the office is reviewing this paper. You cannot edit it now.</p>
            )}
            {paperStatus === "APPROVED" && (
              <p>Approved — you can print this paper for your class.</p>
            )}
          </div>
        ) : null}
      </div>



      <div className="min-w-0 space-y-6">

        {examPaper ? (

          <>

            {isDraft ? (

              <div className="mt-6 space-y-4 print:hidden">

                <ExamQuestionEditor quizId={quizId} quiz={quiz} onChange={updateQuiz} />

                <QuizEditorActions

                  quizId={quizId}

                  quiz={quiz}

                  listHref={listHref}

                  listQueryKey={listQueryKey}

                />

              </div>

            ) : null}

            <div className={isDraft ? "hidden print:block" : isPending ? "mt-6 print:hidden" : "mt-6"}>

              {printSolution ? (

                <ExamSolutionSheet quiz={quiz} />

              ) : (

                <ExamPrintView quiz={quiz} showAnswers={false} />

              )}

            </div>

          </>

        ) : isDraft ? (

          <div className="mt-6 print:hidden">

            {questions}

            <QuizEditorActions

              quizId={quizId}

              quiz={quiz}

              listHref={listHref}

              listQueryKey={listQueryKey}

            />

          </div>

        ) : (

          <div className="mt-6 print:hidden">

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

          </div>

        )}

      </div>

    </div>

  );

}


