"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  academicPlannerService,
  type MyDayPayload,
  type UpsertTeachingRecordInput,
} from "@/services/academic-planner.service";
import { TeachingHelpDialog, type TeachingHelpLessonContext } from "@/components/planner/teaching-help-dialog";
import { formatStatusLabel } from "@/lib/display-labels";
import { useToast } from "@/providers/toast-provider";
import { friendlyApiErrorMessage } from "@/lib/display-labels";

type TodayLessonsListProps = {
  compact?: boolean;
  initialDate?: string;
};

export function TodayLessonsList({ compact, initialDate }: TodayLessonsListProps) {
  const [date, setDate] = useState(initialDate ?? "");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-day", date || "default"],
    queryFn: () => academicPlannerService.myDay(date || undefined),
  });

  const [recording, setRecording] = useState<MyDayPayload["lessons"][number] | null>(null);
  const [form, setForm] = useState<Partial<UpsertTeachingRecordInput>>({ status: "COMPLETED", actualLessons: [] });

  const save = useMutation({
    mutationFn: () => {
      if (!recording?.planner) throw new Error("No planner");
      const lessonKey = recording.plannedLesson?.lessonKey;
      const actualLessons =
        form.status === "COMPLETED" && lessonKey
          ? [{ lessonKey, outcome: "COMPLETED" as const }]
          : form.status === "PARTIAL" && lessonKey
            ? [{ lessonKey, outcome: "PARTIAL" as const }]
            : [];
      return academicPlannerService.upsertTeachingRecord(recording.planner.id, {
        date: data!.date,
        periodNumber: recording.periodNumber,
        status: form.status ?? "COMPLETED",
        actualLessons,
        notes: form.notes,
        unfinishedPortionNote: form.unfinishedPortionNote,
        actualMinutes: form.actualMinutes,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-day"] });
      setRecording(null);
      toast({ title: "Teaching record saved", variant: "success" });
    },
    onError: (err) => {
      toast({ title: "Could not save", description: friendlyApiErrorMessage(err), variant: "error" });
    },
  });

  const [helpLesson, setHelpLesson] = useState<TeachingHelpLessonContext | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const openTeachingHelp = (lesson: MyDayPayload["lessons"][number]) => {
    if (!lesson.planner || !lesson.plannedLesson) return;
    setHelpLesson({
      plannerId: lesson.planner.id,
      lessonKey: lesson.plannedLesson.lessonKey,
      title: lesson.plannedLesson.title,
      chapterTitle: lesson.plannedLesson.chapterTitle,
      classLabel: lesson.classLabel,
      subjectName: lesson.subjectName,
    });
    setHelpOpen(true);
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading lessons…</p>;
  if (isError || !data) return <p className="text-sm text-destructive">Could not load your day.</p>;

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="lesson-date">Date</Label>
            <Input
              id="lesson-date"
              type="date"
              value={date || data.date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
      )}

      {data.lessons.length === 0 && (
        <p className="text-sm text-muted-foreground">No scheduled lessons for this date.</p>
      )}

      {data.lessons.map((lesson) => (
        <Card key={`${lesson.sectionId}-${lesson.periodNumber}-${lesson.subjectId}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {lesson.classLabel} · {lesson.subjectName} · P{lesson.periodNumber}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {formatStatusLabel(lesson.displayStatus)}
              {lesson.startTime && lesson.endTime ? ` · ${lesson.startTime}–${lesson.endTime}` : ""}
            </p>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {lesson.plannedLesson ? (
              <p>
                <span className="font-medium">{lesson.plannedLesson.title}</span>
                {lesson.plannedLesson.chapterTitle ? ` · ${lesson.plannedLesson.chapterTitle}` : ""}
              </p>
            ) : (
              <p className="text-muted-foreground">
                {lesson.planner ? "No planned lesson for this period." : "Timetable only (no approved planner)."}
              </p>
            )}
            {lesson.record && (
              <p className="text-muted-foreground">Reported: {formatStatusLabel(lesson.record.status)}</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {lesson.canRecord && lesson.planner && (
                <Button type="button" size="sm" variant="outline" onClick={() => setRecording(lesson)}>
                  Record teaching
                </Button>
              )}
              {lesson.plannedLesson && lesson.planner && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => openTeachingHelp(lesson)}
                >
                  Help me teach
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      <TeachingHelpDialog open={helpOpen} onOpenChange={setHelpOpen} lesson={helpLesson} />

      {recording && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border bg-background p-4 space-y-3">
            <h3 className="font-semibold">Record teaching</h3>
            <Select
              value={form.status ?? "COMPLETED"}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="CONFIRMED">Confirmed</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="PARTIAL">Partial</option>
              <option value="NOT_TAUGHT">Not taught</option>
              <option value="DIFFERENT_LESSON">Different lesson</option>
            </Select>
            {form.status === "PARTIAL" && (
              <Textarea
                placeholder="What was left unfinished?"
                value={form.unfinishedPortionNote ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, unfinishedPortionNote: e.target.value }))}
              />
            )}
            <Textarea
              placeholder="Notes (required for not taught)"
              value={form.notes ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRecording(null)}>Cancel</Button>
              <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
