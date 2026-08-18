"use client";

import { PageLoader } from "@/components/layout/page-loader";
import { AiWait } from "@/components/layout/ai-wait";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QuizMixFields } from "@/components/quizzes/quiz-mix-fields";
import { quizzesService } from "@/services/quizzes.service";
import { homeworkService } from "@/services/homework.service";
import { teachersService } from "@/services/teachers.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { FileQuestion, Plus } from "lucide-react";

const generateSchema = z
  .object({
    classKey: z.string().min(1, "Select a class"),
    homeworkIds: z.array(z.string()).min(1, "Select at least one topic"),
    title: z.string().optional(),
    quickGenerate: z.boolean(),
    mcqCount: z.coerce.number().min(0).max(20),
    fillBlankCount: z.coerce.number().min(0).max(20),
    shortAnswerCount: z.coerce.number().min(0).max(20),
  })
  .superRefine((value, ctx) => {
    if (
      !value.quickGenerate &&
      value.mcqCount + value.fillBlankCount + value.shortAnswerCount < 1
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["mcqCount"],
        message: "Enter at least one question, or use Quick generate",
      });
    }
  });

type GenerateForm = z.infer<typeof generateSchema>;

export default function TeacherQuizzesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["teacher-quizzes"],
    queryFn: () => quizzesService.list({ limit: 50 }),
  });

  const classes = useQuery({
    queryKey: ["teacher-classes"],
    queryFn: () => teachersService.myClasses(),
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<GenerateForm>({
    resolver: zodResolver(generateSchema),
    defaultValues: {
      homeworkIds: [],
      quickGenerate: true,
      mcqCount: 3,
      fillBlankCount: 1,
      shortAnswerCount: 1,
    },
  });

  const classKey = watch("classKey");
  const selectedHomeworkIds = watch("homeworkIds") ?? [];
  const selectedClass = classes.data?.find((c) => `${c.sectionId}:${c.subjectId}` === classKey);
  const topics = useQuery({
    queryKey: ["homework-topics", selectedClass?.sectionId, selectedClass?.subjectId],
    queryFn: () =>
      homeworkService.list({
        sectionId: selectedClass?.sectionId,
        subjectId: selectedClass?.subjectId,
        limit: 100,
      }),
    enabled: Boolean(selectedClass),
  });

  const generateMutation = useMutation({
    mutationFn: (values: GenerateForm) => {
      const cls = classes.data?.find(
        (c) => `${c.sectionId}:${c.subjectId}` === values.classKey,
      );
      if (!cls) throw new Error("Class not found");
      return quizzesService.generate({
        academicYearId: cls.academicYearId,
        sectionId: cls.sectionId,
        subjectId: cls.subjectId,
        branchId: cls.branchId,
        homeworkIds: values.homeworkIds,
        title: values.title,
        quickGenerate: values.quickGenerate,
        ...(values.quickGenerate
          ? { questionCount: 8 }
          : {
              mcqCount: values.mcqCount,
              fillBlankCount: values.fillBlankCount,
              shortAnswerCount: values.shortAnswerCount,
            }),
      });
    },
    onSuccess: (quiz) => {
      toast({ title: "Quiz generated", description: "Review questions before publishing.", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["teacher-quizzes"] });
      setDialogOpen(false);
      reset();
      window.location.href = `/teacher/quizzes/${quiz.id}`;
    },
    onError: (err) => {
      toast({
        title: "Generation failed",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Quizzes"
        description="Select homework topics and generate a quiz from those titles"
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Generate Quiz
          </Button>
        }
      />

      {isError && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <PageLoader variant="panel" />
        ) : !data?.items.length ? (
          <EmptyState
            icon={<FileQuestion className="h-10 w-10" />}
            title="No quizzes yet"
            description="Generate a quiz from your confirmed lessons."
            action={<Button onClick={() => setDialogOpen(true)}>Generate Quiz</Button>}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((quiz) => (
                <TableRow key={quiz.id}>
                  <TableCell className="font-medium">{quiz.title}</TableCell>
                  <TableCell>{quiz.subject?.name ?? "—"}</TableCell>
                  <TableCell>{quiz.section?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={quiz.status === "PUBLISHED" ? "success" : "secondary"}>
                      {quiz.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(quiz.dueAt)}</TableCell>
                  <TableCell>
                    <Link href={`/teacher/quizzes/${quiz.id}`}>
                      <Button size="sm" variant="outline">Open</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !generateMutation.isPending && setDialogOpen(open)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" onClose={() => !generateMutation.isPending && setDialogOpen(false)}>
          <DialogHeader>
            <DialogTitle>Generate Quiz</DialogTitle>
            <DialogDescription>
              Choose homework topic titles. The quiz will be generated from those topics.
            </DialogDescription>
          </DialogHeader>
          {generateMutation.isPending ? (
            <AiWait kind="quiz" />
          ) : (
          <form
            onSubmit={handleSubmit((v) => generateMutation.mutate(v))}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="classKey">Class</Label>
              <Select
                id="classKey"
                {...register("classKey", {
                  onChange: () => setValue("homeworkIds", []),
                })}
              >
                <option value="">Select class</option>
                {classes.data?.map((cls) => (
                  <option key={`${cls.sectionId}:${cls.subjectId}`} value={`${cls.sectionId}:${cls.subjectId}`}>
                    {cls.gradeName} {cls.sectionName} — {cls.subjectName}
                  </option>
                ))}
              </Select>
              {classes.isError ? (
                <p className="text-sm text-destructive">Could not load classes. Sign out and sign in again.</p>
              ) : !classes.isLoading && !classes.data?.length ? (
                <p className="text-sm text-muted-foreground">
                  No classes assigned to you yet. Ask the school admin to assign a subject to your teacher profile.
                </p>
              ) : null}
              {errors.classKey && <p className="text-sm text-destructive">{errors.classKey.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Topics</Label>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                {!classKey ? (
                  <p className="text-sm text-muted-foreground">Select a class to see homework topics.</p>
                ) : topics.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading topics…</p>
                ) : !topics.data?.items.length ? (
                  <p className="text-sm text-muted-foreground">No homework topics yet. Give homework with a title first.</p>
                ) : (
                  topics.data.items.map((item) => {
                    const checked = selectedHomeworkIds.includes(item.id);
                    return (
                      <label key={item.id} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...selectedHomeworkIds, item.id]
                              : selectedHomeworkIds.filter((id) => id !== item.id);
                            setValue("homeworkIds", next, { shouldValidate: true });
                          }}
                        />
                        <span>
                          <span className="font-medium">{item.title}</span>
                          <span className="block text-xs text-muted-foreground">Due {formatDate(item.dueDate)}</span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              {errors.homeworkIds && <p className="text-sm text-destructive">{errors.homeworkIds.message}</p>}
            </div>
            <QuizMixFields
              quickGenerate={watch("quickGenerate")}
              mcqCount={watch("mcqCount")}
              fillBlankCount={watch("fillBlankCount")}
              shortAnswerCount={watch("shortAnswerCount")}
              onQuickGenerateChange={(value) => setValue("quickGenerate", value, { shouldValidate: true })}
              onMcqChange={(value) => setValue("mcqCount", value, { shouldValidate: true })}
              onFillBlankChange={(value) => setValue("fillBlankCount", value, { shouldValidate: true })}
              onShortAnswerChange={(value) => setValue("shortAnswerCount", value, { shouldValidate: true })}
            />
            {errors.mcqCount && <p className="text-sm text-destructive">{errors.mcqCount.message}</p>}
            <div className="space-y-2">
              <Label htmlFor="title">Quiz title (optional)</Label>
              <Input id="title" {...register("title")} placeholder="Uses selected topics if empty" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                Generate
              </Button>
            </div>
          </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
