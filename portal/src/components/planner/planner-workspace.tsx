"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/layout/empty-state";
import { academicPlannerService } from "@/services/academic-planner.service";
import { formatStatusLabel } from "@/lib/display-labels";
import { formatDate } from "@/lib/utils";
import { toCalendarWeeks, toOutline, toTimeline } from "@/lib/planner-view-model";
import { PlannerStatusBanner } from "@/components/planner/planner-status-banner";
import { PlannerApprovalActions } from "@/components/planner/planner-approval-actions";
import { PlannerRecoveryPanel } from "@/components/planner/planner-recovery-panel";
import { LessonCard } from "@/components/planner/lesson-card";
import { PlannerDayLessonCard } from "@/components/planner/planner-day-lesson-card";
import { PlannerLessonEditDialog } from "@/components/planner/planner-lesson-edit-dialog";
import { TeachingHelpDialog, type TeachingHelpLessonContext } from "@/components/planner/teaching-help-dialog";
import type { PlannerLesson } from "@/lib/planner-view-model";
import { fixDisplayText } from "@/lib/fix-display-text";
import { Button } from "@/components/ui/button";
import { useToast } from "@/providers/toast-provider";
import { friendlyApiErrorMessage } from "@/lib/display-labels";

type PlannerWorkspaceProps = {
  plannerId: string;
  versionId: string;
  readOnly?: boolean;
};

export function PlannerWorkspace({ plannerId, versionId, readOnly }: PlannerWorkspaceProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [helpLesson, setHelpLesson] = useState<TeachingHelpLessonContext | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [editLesson, setEditLesson] = useState<PlannerLesson | null>(null);
  const [moveLesson, setMoveLesson] = useState<PlannerLesson | null>(null);
  const [moveDate, setMoveDate] = useState("");
  const [movePeriod, setMovePeriod] = useState("1");

  const openTeachingHelp = (lesson: PlannerLesson) => {
    setHelpLesson({
      plannerId,
      versionId,
      lessonKey: lesson.lessonKey,
      title: lesson.title,
      lessonKind: lesson.kind,
      chapterTitle: lesson.chapterTitle,
    });
    setHelpOpen(true);
  };
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["planner-version", plannerId, versionId],
    queryFn: () => academicPlannerService.getVersion(plannerId, versionId),
  });

  const generate = useMutation({
    mutationFn: () =>
      academicPlannerService.generateSchedule(plannerId, versionId, data!.version.revision),
    onSuccess: (payload) => {
      queryClient.setQueryData(["planner-version", plannerId, versionId], payload);
      toast({ title: "Schedule generated", variant: "success" });
    },
    onError: (err) => {
      toast({
        title: "Could not generate schedule",
        description: friendlyApiErrorMessage(err),
        variant: "error",
      });
    },
  });

  const saveLesson = useMutation({
    mutationFn: (body: {
      lessonKey: string;
      expectedRevision: number;
      title?: string;
      objectives?: string[];
      notes?: string;
      kind?: PlannerLesson["kind"];
    }) => {
      const { lessonKey, ...rest } = body;
      return academicPlannerService.updateLesson(plannerId, versionId, lessonKey, rest);
    },
    onSuccess: (payload) => {
      queryClient.setQueryData(["planner-version", plannerId, versionId], payload);
      setEditLesson(null);
      toast({ title: "Day updated", variant: "success" });
    },
    onError: (err) => {
      toast({ title: "Could not save", description: friendlyApiErrorMessage(err), variant: "error" });
    },
  });

  const regenLesson = useMutation({
    mutationFn: (input: { lessonKey: string; regenerateActivity?: boolean }) =>
      academicPlannerService.regenerateLesson(plannerId, versionId, input.lessonKey, {
        expectedRevision: data!.version.revision,
        regenerateActivity: input.regenerateActivity,
      }),
    onSuccess: (payload) => {
      queryClient.setQueryData(["planner-version", plannerId, versionId], payload);
      setEditLesson(null);
      toast({ title: "Day regenerated from teaching pack", variant: "success" });
    },
    onError: (err) => {
      toast({ title: "Regenerate failed", description: friendlyApiErrorMessage(err), variant: "error" });
    },
  });

  const moveLessonMut = useMutation({
    mutationFn: (input: { lessonKey: string; date: string; periodNumber: number }) =>
      academicPlannerService.moveLesson(plannerId, versionId, input.lessonKey, {
        expectedRevision: data!.version.revision,
        date: input.date,
        periodNumber: input.periodNumber,
      }),
    onSuccess: (payload) => {
      queryClient.setQueryData(["planner-version", plannerId, versionId], payload);
      setMoveLesson(null);
      toast({ title: "Day moved", variant: "success" });
    },
    onError: (err) => {
      toast({ title: "Could not move", description: friendlyApiErrorMessage(err), variant: "error" });
    },
  });

  const analyzeAll = useMutation({
    mutationFn: async () => {
      if (!data) return data;
      let revision = data.version.revision;
      for (const chapter of data.chapters) {
        const key = String(chapter.chapterKey);
        const payload = await academicPlannerService.analyzeChapter(plannerId, versionId, key, {
          expectedRevision: revision,
        });
        revision = payload.version.revision;
      }
      return revision;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["planner-version", plannerId, versionId] });
      toast({ title: "Chapters analyzed", variant: "success" });
    },
    onError: (err) => {
      toast({
        title: "Analysis failed",
        description: friendlyApiErrorMessage(err),
        variant: "error",
      });
    },
  });

  if (isLoading) return <PageLoader />;
  if (isError || !data) {
    return (
      <EmptyState
        title="Could not load planner"
        description={error instanceof Error ? error.message : "Try again later."}
      />
    );
  }

  const weeks = toCalendarWeeks(data);
  const timeline = toTimeline(data);
  const outline = toOutline(data);
  const pendingAnalysis = data.chapters.filter((c) => !c.analysisSource);
  const dayPlanLessons = [...data.lessons].sort((a, b) => {
    const da = a.dayNumber ?? a.sequence;
    const db = b.dayNumber ?? b.sequence;
    return da - db;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.planner.title || `${data.planner.classLabel} — ${data.planner.subject.name}`}
        description={`${data.planner.teacher.name} · ${formatStatusLabel(data.planner.examType)} · Exam ${formatDate(data.planner.examDate)}${readOnly ? " · View only" : ""}`}
        actions={
          <Badge variant="secondary">
            v{data.version.versionNumber} · {formatStatusLabel(data.version.status)}
          </Badge>
        }
      />

      <PlannerStatusBanner payload={data} />

      {!readOnly && (
        <PlannerRecoveryPanel plannerId={plannerId} versionId={versionId} payload={data} />
      )}

      {!readOnly &&
        (data.permissions.canSubmit ||
          data.permissions.canDecide ||
          data.permissions.canPublishDirectly) && (
        <PlannerApprovalActions plannerId={plannerId} versionId={versionId} payload={data} />
      )}

      {!readOnly && data.permissions.canEdit && data.version.origin !== "RECOVERY" && (
        <div className="space-y-2">
          {pendingAnalysis.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {pendingAnalysis.length} chapter(s) not analyzed yet:{" "}
              {pendingAnalysis.map((c) => c.title).join(", ")}. Use{" "}
              <strong>Analyze all chapters</strong>, or{" "}
              <strong>Generate schedule</strong> to analyze them automatically.
            </div>
          )}
          {!data.version.summary && (
            <p className="text-sm text-muted-foreground">
              Analyze all chapters, then generate the schedule. If your school has not published a
              timetable for this subject, the planner uses assumed weekly periods (see warnings after
              generation).
            </p>
          )}
          <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={analyzeAll.isPending || !data.chapters.length}
            onClick={() => analyzeAll.mutate()}
          >
            {analyzeAll.isPending ? "Analyzing…" : "Analyze all chapters"}
          </Button>
          <Button
            type="button"
            disabled={generate.isPending}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? "Generating…" : "Generate schedule"}
          </Button>
          </div>
        </div>
      )}

      <Tabs defaultValue="days">
        <TabsList>
          <TabsTrigger value="days">Day by day</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="outline">Outline</TabsTrigger>
        </TabsList>

        <TabsContent value="days" className="space-y-4 pt-4">
          {dayPlanLessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Generate the schedule to see Day 1, Day 2, … with teaching steps and activity days.
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {dayPlanLessons.map((lesson) => (
                <PlannerDayLessonCard
                  key={lesson.lessonKey}
                  lesson={lesson}
                  readOnly={readOnly}
                  onEdit={readOnly || !data.permissions.canEdit ? undefined : () => setEditLesson(lesson)}
                  onMove={
                    readOnly || !data.permissions.canEdit
                      ? undefined
                      : () => {
                          setMoveLesson(lesson);
                          setMoveDate(lesson.date ?? data.calendar.from);
                          setMovePeriod(String(lesson.periodNumber ?? 1));
                        }
                  }
                  onTeachingHelp={readOnly ? undefined : () => openTeachingHelp(lesson)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="calendar" className="space-y-4 pt-4">
          {weeks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No calendar days in this plan yet.</p>
          ) : (
            weeks.map((week) => (
              <div key={week.weekStart} className="space-y-2">
                <p className="text-sm font-medium">Week of {formatDate(week.weekStart)}</p>
                <div className="grid gap-3 md:grid-cols-5">
                  {week.days.map((day) => (
                    <div
                      key={day.date}
                      className={`rounded-md border p-2 text-xs ${
                        day.working ? "border-border" : "border-dashed bg-muted/40 opacity-70"
                      }`}
                    >
                      <p className="font-medium">{formatDate(day.date)}</p>
                      {!day.working && day.reason && (
                        <p className="text-muted-foreground">{day.reason}</p>
                      )}
                      <div className="mt-2 space-y-2">
                        {day.slots.map((slot) => {
                          const lesson = data.lessons.find(
                            (l) => l.date === day.date && l.periodNumber === slot.periodNumber,
                          );
                          return (
                            <div key={slot.periodNumber} className="rounded border border-border/60 p-1">
                              <p className="text-[10px] text-muted-foreground">
                                P{slot.periodNumber}
                                {slot.reserved === "REVISION" ? " · Revision" : ""}
                              </p>
                              {lesson ? (
                                <LessonCard
                                  lesson={lesson}
                                  compact
                                  onTeachingHelp={
                                    readOnly ? undefined : () => openTeachingHelp(lesson)
                                  }
                                />
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="timeline" className="space-y-4 pt-4">
          {timeline.scheduled.map((row) => (
            <div key={row.date}>
              <p className="mb-2 text-sm font-medium">{formatDate(row.date)}</p>
              <div className="space-y-2">
                {row.lessons.map((lesson) => (
                  <LessonCard
                    key={lesson.lessonKey}
                    lesson={lesson}
                    onTeachingHelp={readOnly ? undefined : () => openTeachingHelp(lesson)}
                  />
                ))}
              </div>
            </div>
          ))}
          {timeline.unscheduled.length > 0 && (
            <div className="rounded-md border border-dashed p-4">
              <p className="mb-2 text-sm font-medium">Unscheduled</p>
              <div className="space-y-2">
                {timeline.unscheduled.map((lesson) => (
                  <LessonCard
                    key={lesson.lessonKey}
                    lesson={lesson}
                    onTeachingHelp={readOnly ? undefined : () => openTeachingHelp(lesson)}
                  />
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="outline" className="space-y-4 pt-4">
          {outline.map((chapter) => (
            <div key={chapter.chapterKey}>
              <p className="mb-2 font-medium">{chapter.title}</p>
              <div className="space-y-2 border-l-2 border-primary/20 pl-3">
                {chapter.lessons.map((lesson) => (
                  <LessonCard
                    key={lesson.lessonKey}
                    lesson={lesson}
                    onTeachingHelp={readOnly ? undefined : () => openTeachingHelp(lesson)}
                  />
                ))}
              </div>
            </div>
          ))}
          {outline.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No lessons yet. Run chapter analysis and generate when those actions are available.
            </p>
          )}
        </TabsContent>
      </Tabs>

      <TeachingHelpDialog open={helpOpen} onOpenChange={setHelpOpen} lesson={helpLesson} />

      <PlannerLessonEditDialog
        open={Boolean(editLesson)}
        lesson={editLesson}
        revision={data.version.revision}
        saving={saveLesson.isPending || regenLesson.isPending}
        onClose={() => setEditLesson(null)}
        onSave={(body) => {
          if (!editLesson) return;
          saveLesson.mutate({ lessonKey: editLesson.lessonKey, ...body });
        }}
        onRegenerate={(opts) => {
          if (!editLesson) return;
          regenLesson.mutate({ lessonKey: editLesson.lessonKey, ...opts });
        }}
      />

      {moveLesson && !readOnly && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-lg">
            <h2 className="text-lg font-semibold">Move day</h2>
            <p className="mt-1 text-sm text-muted-foreground">{fixDisplayText(moveLesson.title)}</p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                Date
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
                  value={moveDate}
                  onChange={(e) => setMoveDate(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Period
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
                  value={movePeriod}
                  onChange={(e) => setMovePeriod(e.target.value)}
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                disabled={moveLessonMut.isPending}
                onClick={() =>
                  moveLessonMut.mutate({
                    lessonKey: moveLesson.lessonKey,
                    date: moveDate,
                    periodNumber: Number(movePeriod) || 1,
                  })
                }
              >
                {moveLessonMut.isPending ? "Moving…" : "Move"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setMoveLesson(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
