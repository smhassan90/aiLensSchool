"use client";

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
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { quizzesService } from "@/services/quizzes.service";
import { teachersService } from "@/services/teachers.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { FileQuestion, Plus } from "lucide-react";

const generateSchema = z.object({
  classKey: z.string().min(1, "Select a class"),
  lessonDateFrom: z.string().min(1, "Required"),
  lessonDateTo: z.string().min(1, "Required"),
  questionCount: z.coerce.number().min(1).max(30).optional(),
  title: z.string().optional(),
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
    formState: { errors },
  } = useForm<GenerateForm>({
    resolver: zodResolver(generateSchema),
    defaultValues: {
      questionCount: 10,
      lessonDateFrom: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
      lessonDateTo: new Date().toISOString().slice(0, 10),
    },
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
        lessonDateFrom: values.lessonDateFrom,
        lessonDateTo: values.lessonDateTo,
        questionCount: values.questionCount,
        title: values.title,
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
    <div className="p-8">
      <PageHeader
        title="Quizzes"
        description="Generate quizzes from confirmed lessons and publish to students"
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
          <div className="space-y-3 p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={() => setDialogOpen(false)}>
          <DialogHeader>
            <DialogTitle>Generate Quiz</DialogTitle>
            <DialogDescription>
              AI will create questions from confirmed lessons in the date range.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={handleSubmit((v) => generateMutation.mutate(v))}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="classKey">Class</Label>
              <Select id="classKey" {...register("classKey")}>
                <option value="">Select class</option>
                {classes.data?.map((cls) => (
                  <option key={`${cls.sectionId}:${cls.subjectId}`} value={`${cls.sectionId}:${cls.subjectId}`}>
                    {cls.gradeName} {cls.sectionName} — {cls.subjectName}
                  </option>
                ))}
              </Select>
              {errors.classKey && <p className="text-sm text-destructive">{errors.classKey.message}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lessonDateFrom">From</Label>
                <Input id="lessonDateFrom" type="date" {...register("lessonDateFrom")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lessonDateTo">To</Label>
                <Input id="lessonDateTo" type="date" {...register("lessonDateTo")} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="questionCount">Questions</Label>
                <Input id="questionCount" type="number" min={1} max={30} {...register("questionCount")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Title (optional)</Label>
                <Input id="title" {...register("title")} placeholder="Weekly Quiz" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={generateMutation.isPending}>
                {generateMutation.isPending ? "Generating…" : "Generate"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
