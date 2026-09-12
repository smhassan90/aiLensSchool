"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { AiWait } from "@/components/layout/ai-wait";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { quizzesService } from "@/services/quizzes.service";
import { lessonsService } from "@/services/lessons.service";
import { teachersService } from "@/services/teachers.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { examPaperLabel, examStatusLabel } from "@/lib/exam-paper";
import { formatDate } from "@/lib/utils";
import { FileText, Plus } from "lucide-react";

const schema = z
  .object({
    paperKind: z.enum(["ASSESSMENT", "MID_TERM", "FINAL_TERM"]),
    classKey: z.string().min(1, "Select a class"),
    lessonIds: z.array(z.string()).min(1, "Select at least one lecture"),
    mcqCount: z.coerce.number().min(0).max(40),
    trueFalseCount: z.coerce.number().min(0).max(40),
    openEndedCount: z.coerce.number().min(0).max(40),
    mcqMarks: z.coerce.number().min(0).max(200),
    trueFalseMarks: z.coerce.number().min(0).max(200),
    openEndedMarks: z.coerce.number().min(0).max(200),
  })
  .superRefine((value, ctx) => {
    if (value.mcqCount + value.trueFalseCount + value.openEndedCount < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["mcqCount"],
        message: "Add at least one question",
      });
    }
    if (value.mcqCount && value.mcqMarks <= 0) {
      ctx.addIssue({ code: "custom", path: ["mcqMarks"], message: "Enter marks for MCQs" });
    }
    if (value.trueFalseCount && value.trueFalseMarks <= 0) {
      ctx.addIssue({ code: "custom", path: ["trueFalseMarks"], message: "Enter marks for true/false" });
    }
    if (value.openEndedCount && value.openEndedMarks <= 0) {
      ctx.addIssue({ code: "custom", path: ["openEndedMarks"], message: "Enter marks for open-ended" });
    }
  });

type FormValues = z.infer<typeof schema>;

function MixField({
  countId,
  marksId,
  label,
  count,
  marks,
  onCount,
  onMarks,
}: {
  countId: string;
  marksId: string;
  label: string;
  count: number;
  marks: number;
  onCount: (value: number) => void;
  onMarks: (value: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label htmlFor={countId}>{label}</Label>
        <Input
          id={countId}
          type="number"
          min={0}
          max={40}
          value={count}
          onChange={(e) => onCount(Math.max(0, Number(e.target.value) || 0))}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={marksId}>Marks</Label>
        <Input
          id={marksId}
          type="number"
          min={0}
          max={200}
          value={marks}
          onChange={(e) => onMarks(Math.max(0, Number(e.target.value) || 0))}
        />
      </div>
    </div>
  );
}

export default function TeacherExamsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const papers = useQuery({
    queryKey: ["teacher-exam-papers"],
    queryFn: () => quizzesService.list({ limit: 50, paperKind: "EXAM" }),
  });
  const classes = useQuery({
    queryKey: ["teacher-classes"],
    queryFn: () => teachersService.myClasses(),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      paperKind: "ASSESSMENT",
      lessonIds: [],
      mcqCount: 8,
      trueFalseCount: 5,
      openEndedCount: 4,
      mcqMarks: 16,
      trueFalseMarks: 5,
      openEndedMarks: 20,
    },
  });

  const classKey = form.watch("classKey");
  const selectedClass = classes.data?.find((row) => `${row.sectionId}:${row.subjectId}` === classKey);
  const lectures = useQuery({
    queryKey: ["exam-lectures", selectedClass?.sectionId, selectedClass?.subjectId],
    queryFn: () =>
      lessonsService.list({
        sectionId: selectedClass?.sectionId,
        subjectId: selectedClass?.subjectId,
        status: "CONFIRMED",
        limit: 100,
      }),
    enabled: Boolean(selectedClass),
  });

  const selectedLessonIds = form.watch("lessonIds") ?? [];
  const totals = useMemo(() => {
    const questions =
      Number(form.watch("mcqCount")) + Number(form.watch("trueFalseCount")) + Number(form.watch("openEndedCount"));
    const marks =
      Number(form.watch("mcqMarks")) + Number(form.watch("trueFalseMarks")) + Number(form.watch("openEndedMarks"));
    return { questions, marks };
  }, [form]);

  const generate = useMutation({
    mutationFn: (values: FormValues) => {
      const cls = classes.data?.find((row) => `${row.sectionId}:${row.subjectId}` === values.classKey);
      if (!cls) throw new Error("Class not found");
      return quizzesService.generate({
        academicYearId: cls.academicYearId,
        sectionId: cls.sectionId,
        subjectId: cls.subjectId,
        branchId: cls.branchId,
        lessonIds: values.lessonIds,
        paperKind: values.paperKind,
        quickGenerate: false,
        mcqCount: values.mcqCount,
        trueFalseCount: values.trueFalseCount,
        openEndedCount: values.openEndedCount,
        mcqMarks: values.mcqMarks,
        trueFalseMarks: values.trueFalseMarks,
        openEndedMarks: values.openEndedMarks,
      });
    },
    onSuccess: (paper) => {
      toast({ title: "Paper generated", description: "Review it, then submit for printout.", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["teacher-exam-papers"] });
      setOpen(false);
      form.reset();
      window.location.href = `/teacher/exams/${paper.id}`;
    },
    onError: (err) => {
      toast({
        title: "Could not generate paper",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    },
  });

  const toggleLesson = (id: string) => {
    const next = selectedLessonIds.includes(id)
      ? selectedLessonIds.filter((item) => item !== id)
      : [...selectedLessonIds, id];
    form.setValue("lessonIds", next, { shouldValidate: true });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Exam papers"
        description="Generate an assessment, mid term, or final from multiple lectures, then submit it for the office to print."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Generate paper
          </Button>
        }
      />

      <div className="rounded-lg border bg-card">
        {papers.isLoading ? (
          <PageLoader variant="panel" task="exams" />
        ) : !papers.data?.items.length ? (
          <EmptyState
            icon={<FileText className="h-10 w-10" />}
            title="No exam papers yet"
            description="Pick lectures, set MCQs, true/false, and open-ended marks, then generate."
            action={<Button onClick={() => setOpen(true)}>Generate paper</Button>}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paper</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Marks</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {papers.data.items.map((paper) => (
                <TableRow key={paper.id}>
                  <TableCell className="font-medium">
                    {paper.title}
                    <p className="text-xs text-muted-foreground">{examPaperLabel(paper.paperKind)}</p>
                  </TableCell>
                  <TableCell>
                    {paper.subject?.name ?? "—"} {paper.section?.name ?? ""}
                  </TableCell>
                  <TableCell>
                    <Badge variant={paper.status === "CLOSED" ? "success" : "warning"}>
                      {examStatusLabel(paper.status, paper.paperKind)}
                    </Badge>
                  </TableCell>
                  <TableCell>{paper.totalMarks ?? "—"}</TableCell>
                  <TableCell>
                    <Link href={`/teacher/exams/${paper.id}`}>
                      <Button size="sm" variant="outline">Open</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" onClose={() => setOpen(false)}>
          <DialogHeader>
            <DialogTitle>Generate exam paper</DialogTitle>
            <DialogDescription>
              Choose the paper type, lectures, question counts, and marks for each section.
            </DialogDescription>
          </DialogHeader>
          {generate.isPending ? (
            <AiWait kind="exam" />
          ) : (
            <form className="space-y-4" onSubmit={form.handleSubmit((values) => generate.mutate(values))}>
              <div className="space-y-2">
                <Label htmlFor="paperKind">Paper</Label>
                <Select id="paperKind" {...form.register("paperKind")}>
                  <option value="ASSESSMENT">Assessment</option>
                  <option value="MID_TERM">Mid term</option>
                  <option value="FINAL_TERM">Final term</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="classKey">Class and subject</Label>
                <Select id="classKey" {...form.register("classKey")}>
                  <option value="">Select class</option>
                  {(classes.data ?? []).map((row) => (
                    <option key={`${row.sectionId}:${row.subjectId}`} value={`${row.sectionId}:${row.subjectId}`}>
                      {row.gradeName} {row.sectionName} · {row.subjectName}
                    </option>
                  ))}
                </Select>
                {form.formState.errors.classKey && (
                  <p className="text-sm text-destructive">{form.formState.errors.classKey.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Lectures</Label>
                {!selectedClass ? (
                  <p className="text-sm text-muted-foreground">Select a class to see confirmed lectures.</p>
                ) : lectures.isLoading ? (
                  <PageLoader variant="panel" />
                ) : !lectures.data?.items.length ? (
                  <p className="text-sm text-muted-foreground">
                    No confirmed lectures yet. Confirm lessons first, then generate the paper from them.
                  </p>
                ) : (
                  <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2">
                    {lectures.data.items.map((lesson) => (
                      <label key={lesson.id} className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selectedLessonIds.includes(lesson.id)}
                          onChange={() => toggleLesson(lesson.id)}
                        />
                        <span>
                          <span className="font-medium">{lesson.topicName || lesson.chapterName || "Lecture"}</span>
                          <span className="block text-xs text-muted-foreground">{formatDate(lesson.date)}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {form.formState.errors.lessonIds && (
                  <p className="text-sm text-destructive">{form.formState.errors.lessonIds.message}</p>
                )}
              </div>
              <MixField
                countId="mcqCount"
                marksId="mcqMarks"
                label="MCQs"
                count={form.watch("mcqCount")}
                marks={form.watch("mcqMarks")}
                onCount={(value) => form.setValue("mcqCount", value, { shouldValidate: true })}
                onMarks={(value) => form.setValue("mcqMarks", value, { shouldValidate: true })}
              />
              <MixField
                countId="trueFalseCount"
                marksId="trueFalseMarks"
                label="True / False"
                count={form.watch("trueFalseCount")}
                marks={form.watch("trueFalseMarks")}
                onCount={(value) => form.setValue("trueFalseCount", value, { shouldValidate: true })}
                onMarks={(value) => form.setValue("trueFalseMarks", value, { shouldValidate: true })}
              />
              <MixField
                countId="openEndedCount"
                marksId="openEndedMarks"
                label="Open-ended"
                count={form.watch("openEndedCount")}
                marks={form.watch("openEndedMarks")}
                onCount={(value) => form.setValue("openEndedCount", value, { shouldValidate: true })}
                onMarks={(value) => form.setValue("openEndedMarks", value, { shouldValidate: true })}
              />
              <p className="text-xs text-muted-foreground">
                {totals.questions} questions · {totals.marks} marks total
              </p>
              {form.formState.errors.mcqCount && (
                <p className="text-sm text-destructive">{form.formState.errors.mcqCount.message}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Generate</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
