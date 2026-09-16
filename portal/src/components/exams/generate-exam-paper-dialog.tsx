"use client";

import { UseFormReturn } from "react-hook-form";
import { PageLoader } from "@/components/layout/page-loader";
import { AiWait } from "@/components/layout/ai-wait";
import { DifficultySlider } from "@/components/exams/difficulty-slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";

export type GenerateExamPaperFormValues = {
  examConfigId?: string;
  classKey?: string;
  difficulty: number;
  lessonIds: string[];
  mcqCount: number;
  fillBlankCount: number;
  trueFalseCount: number;
  shortAnswerCount: number;
  longAnswerCount: number;
  mcqMarks: number;
  fillBlankMarks: number;
  trueFalseMarks: number;
  shortAnswerMarks: number;
  longAnswerMarks: number;
};

type TeacherClass = {
  sectionId: string;
  subjectId: string;
  academicYearId: string;
  gradeName: string;
  sectionName: string;
  subjectName: string;
};

type ExamConfig = {
  id: string;
  name: string;
  startDate?: string | null;
};

type Lesson = {
  id: string;
  topicName?: string | null;
  chapterName?: string | null;
  date: string;
};

function QuestionMixRow({
  label,
  countId,
  marksId,
  count,
  marks,
  onCount,
  onMarks,
}: {
  label: string;
  countId: string;
  marksId: string;
  count: number;
  marks: number;
  onCount: (value: number) => void;
  onMarks: (value: number) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_5.5rem_5.5rem] items-end gap-3 border-b border-border/70 py-3 last:border-0 last:pb-0">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={countId} className="text-xs text-muted-foreground">Questions</Label>
        <Input
          id={countId}
          type="number"
          min={0}
          max={40}
          value={count}
          onChange={(e) => onCount(Math.max(0, Number(e.target.value) || 0))}
          className="h-9"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={marksId} className="text-xs text-muted-foreground">Marks</Label>
        <Input
          id={marksId}
          type="number"
          min={0}
          max={200}
          value={marks}
          onChange={(e) => onMarks(Math.max(0, Number(e.target.value) || 0))}
          className="h-9"
        />
      </div>
    </div>
  );
}

type AssignmentInfo = {
  id: string;
  examName: string;
  className: string;
  subjectName: string;
  maxMarks: number;
  submissionDueAt: string;
};

type GenerateExamPaperDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: UseFormReturn<GenerateExamPaperFormValues>;
  classes: TeacherClass[];
  examConfigs: ExamConfig[];
  examConfigsLoading: boolean;
  lectures: Lesson[];
  lecturesLoading: boolean;
  selectedClass: TeacherClass | undefined;
  selectedLessonIds: string[];
  onToggleLesson: (id: string) => void;
  onSubmit: (values: GenerateExamPaperFormValues) => void;
  isGenerating: boolean;
  assignment?: AssignmentInfo | null;
};

export function GenerateExamPaperDialog({
  open,
  onOpenChange,
  form,
  classes,
  examConfigs,
  examConfigsLoading,
  lectures,
  lecturesLoading,
  selectedClass,
  selectedLessonIds,
  onToggleLesson,
  onSubmit,
  isGenerating,
  assignment,
}: GenerateExamPaperDialogProps) {
  const { register, watch, setValue, formState, handleSubmit } = form;
  const difficulty = watch("difficulty");
  const mcqCount = watch("mcqCount");
  const fillBlankCount = watch("fillBlankCount");
  const trueFalseCount = watch("trueFalseCount");
  const shortAnswerCount = watch("shortAnswerCount");
  const longAnswerCount = watch("longAnswerCount");
  const mcqMarks = watch("mcqMarks");
  const fillBlankMarks = watch("fillBlankMarks");
  const trueFalseMarks = watch("trueFalseMarks");
  const shortAnswerMarks = watch("shortAnswerMarks");
  const longAnswerMarks = watch("longAnswerMarks");
  const requiredMarks = assignment?.maxMarks;
  const totals = {
    questions:
      Number(mcqCount) + Number(fillBlankCount) + Number(trueFalseCount) + Number(shortAnswerCount) + Number(longAnswerCount),
    marks:
      Number(mcqMarks) + Number(fillBlankMarks) + Number(trueFalseMarks) + Number(shortAnswerMarks) + Number(longAnswerMarks),
  };
  const marksMismatch = requiredMarks != null && totals.marks !== requiredMarks;

  return (
    <Dialog open={open} onOpenChange={(next) => !isGenerating && onOpenChange(next)}>
      <DialogContent
        className="flex max-h-[92vh] max-w-2xl flex-col overflow-hidden p-0 sm:max-w-2xl"
        onClose={() => !isGenerating && onOpenChange(false)}
      >
        <div className="border-b px-4 py-5 sm:px-6">
          <DialogHeader className="mb-0 pr-8">
            <DialogTitle>Generate exam paper</DialogTitle>
            <DialogDescription>
              {assignment
                ? `Generate ${assignment.examName} for ${assignment.className} · ${assignment.subjectName}. Total marks must be ${assignment.maxMarks}.`
                : "Choose lectures and set marks per question type. The system will draft the paper in sections for your review."}
            </DialogDescription>
          </DialogHeader>
        </div>

        {isGenerating ? (
          <div className="px-4 py-8 sm:px-6">
            <AiWait kind="exam" />
          </div>
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
              <section className="space-y-4 rounded-xl border bg-muted/20 p-4">
                <h3 className="text-sm font-semibold text-foreground">Paper details</h3>
                <div className="space-y-4">
                  {assignment ? (
                    <div className="rounded-lg border bg-background px-3 py-3 text-sm">
                      <p className="font-medium">{assignment.examName}</p>
                      <p className="text-muted-foreground">
                        {assignment.className} · {assignment.subjectName}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        Submit by {formatDate(assignment.submissionDueAt)} · {assignment.maxMarks} marks required
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="classKey">Class and subject</Label>
                        <Select
                          id="classKey"
                          {...register("classKey")}
                          onChange={(e) => {
                            setValue("classKey", e.target.value);
                            setValue("examConfigId", "");
                            setValue("lessonIds", []);
                          }}
                        >
                          <option value="">Select class</option>
                          {classes.map((row) => (
                            <option key={`${row.sectionId}:${row.subjectId}`} value={`${row.sectionId}:${row.subjectId}`}>
                              {row.gradeName} {row.sectionName} · {row.subjectName}
                            </option>
                          ))}
                        </Select>
                        {formState.errors.classKey && (
                          <p className="text-sm text-destructive">{formState.errors.classKey.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="examConfigId">Exam paper</Label>
                        {!selectedClass ? (
                          <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                            Select a class first.
                          </p>
                        ) : examConfigsLoading ? (
                          <PageLoader variant="panel" />
                        ) : !examConfigs.length ? (
                          <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                            No exam papers configured yet. Ask the office to set them up under Exams.
                          </p>
                        ) : (
                          <Select id="examConfigId" {...register("examConfigId")}>
                            <option value="">Select exam</option>
                            {examConfigs.map((exam) => (
                              <option key={exam.id} value={exam.id}>
                                {exam.name}
                                {exam.startDate ? ` · ${formatDate(exam.startDate)}` : ""}
                              </option>
                            ))}
                          </Select>
                        )}
                        {formState.errors.examConfigId && (
                          <p className="text-sm text-destructive">{formState.errors.examConfigId.message}</p>
                        )}
                      </div>
                    </>
                  )}

                  <div className="rounded-lg border bg-background px-3 py-4">
                    <DifficultySlider
                      value={difficulty}
                      onChange={(value) => setValue("difficulty", value, { shouldValidate: true })}
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Lectures</h3>
                  {selectedLessonIds.length ? (
                    <span className="text-xs text-muted-foreground">
                      {selectedLessonIds.length} selected
                    </span>
                  ) : null}
                </div>
                {!selectedClass ? (
                  <p className="text-sm text-muted-foreground">Select a class to see confirmed lectures.</p>
                ) : lecturesLoading ? (
                  <PageLoader variant="panel" />
                ) : !lectures.length ? (
                  <p className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
                    No confirmed lectures yet. Confirm lessons first, then generate the paper from them.
                  </p>
                ) : (
                  <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border bg-background p-2">
                    {lectures.map((lesson) => {
                      const checked = selectedLessonIds.includes(lesson.id);
                      return (
                        <label
                          key={lesson.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-sm transition-colors ${
                            checked ? "bg-accent/70" : "hover:bg-muted/60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded border-input"
                            checked={checked}
                            onChange={() => onToggleLesson(lesson.id)}
                          />
                          <span className="min-w-0">
                            <span className="block font-medium">
                              {lesson.topicName || lesson.chapterName || "Lecture"}
                            </span>
                            <span className="text-xs text-muted-foreground">{formatDate(lesson.date)}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {formState.errors.lessonIds && (
                  <p className="text-sm text-destructive">{formState.errors.lessonIds.message}</p>
                )}
              </section>

              <section className="space-y-3 rounded-xl border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground">Question mix</h3>
                <div className="hidden grid-cols-[1fr_5.5rem_5.5rem] gap-3 px-0 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
                  <span>Type</span>
                  <span>Questions</span>
                  <span>Marks</span>
                </div>
                <QuestionMixRow
                  label="Multiple choice"
                  countId="mcqCount"
                  marksId="mcqMarks"
                  count={mcqCount}
                  marks={mcqMarks}
                  onCount={(value) => setValue("mcqCount", value, { shouldValidate: true })}
                  onMarks={(value) => setValue("mcqMarks", value, { shouldValidate: true })}
                />
                <QuestionMixRow
                  label="Fill in the blanks"
                  countId="fillBlankCount"
                  marksId="fillBlankMarks"
                  count={fillBlankCount}
                  marks={fillBlankMarks}
                  onCount={(value) => setValue("fillBlankCount", value, { shouldValidate: true })}
                  onMarks={(value) => setValue("fillBlankMarks", value, { shouldValidate: true })}
                />
                <QuestionMixRow
                  label="True / False"
                  countId="trueFalseCount"
                  marksId="trueFalseMarks"
                  count={trueFalseCount}
                  marks={trueFalseMarks}
                  onCount={(value) => setValue("trueFalseCount", value, { shouldValidate: true })}
                  onMarks={(value) => setValue("trueFalseMarks", value, { shouldValidate: true })}
                />
                <QuestionMixRow
                  label="Short questions"
                  countId="shortAnswerCount"
                  marksId="shortAnswerMarks"
                  count={shortAnswerCount}
                  marks={shortAnswerMarks}
                  onCount={(value) => setValue("shortAnswerCount", value, { shouldValidate: true })}
                  onMarks={(value) => setValue("shortAnswerMarks", value, { shouldValidate: true })}
                />
                <QuestionMixRow
                  label="Long questions"
                  countId="longAnswerCount"
                  marksId="longAnswerMarks"
                  count={longAnswerCount}
                  marks={longAnswerMarks}
                  onCount={(value) => setValue("longAnswerCount", value, { shouldValidate: true })}
                  onMarks={(value) => setValue("longAnswerMarks", value, { shouldValidate: true })}
                />
                {formState.errors.mcqCount && (
                  <p className="text-sm text-destructive">{formState.errors.mcqCount.message}</p>
                )}
              </section>
            </div>

            <div className="border-t bg-muted/20 px-4 py-4 sm:px-6">
              <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm ${marksMismatch ? "border-amber-300 bg-amber-50" : "bg-background"}`}>
                <span className="text-muted-foreground">Paper total</span>
                <span className={`font-semibold ${marksMismatch ? "text-amber-900" : "text-foreground"}`}>
                  {totals.questions} questions · {totals.marks} marks
                  {requiredMarks != null ? ` (required ${requiredMarks})` : ""}
                </span>
              </div>
              {marksMismatch ? (
                <p className="mb-3 text-sm text-amber-800">
                  Section marks must add up to exactly {requiredMarks} before you generate.
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={marksMismatch}>Generate paper</Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
