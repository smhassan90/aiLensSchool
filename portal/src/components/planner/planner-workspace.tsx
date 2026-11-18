"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/page-header";
import { PageLoader } from "@/components/layout/page-loader";
import { AiWait } from "@/components/layout/ai-wait";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/empty-state";
import { academicPlannerService } from "@/services/academic-planner.service";
import { formatStatusLabel } from "@/lib/display-labels";
import { formatDate } from "@/lib/utils";
import { PlannerStatusBanner } from "@/components/planner/planner-status-banner";
import { PlannerApprovalActions } from "@/components/planner/planner-approval-actions";
import { PlannerRecoveryPanel } from "@/components/planner/planner-recovery-panel";
import { PlannerMonthBoard } from "@/components/planner/planner-month-board";
import { PlannerPrintSheet } from "@/components/planner/planner-print-sheet";
import { PlannerLessonEditDialog } from "@/components/planner/planner-lesson-edit-dialog";
import type { PlannerLesson } from "@/lib/planner-view-model";
import { fixDisplayText } from "@/lib/fix-display-text";
import { Button } from "@/components/ui/button";
import { useToast } from "@/providers/toast-provider";
import { friendlyApiErrorMessage } from "@/lib/display-labels";
import { ApiClientError } from "@/lib/api-client";

type PlannerWorkspaceProps = {
  plannerId: string;
  versionId: string;
  readOnly?: boolean;
  listHref?: string;
  autoBuild?: boolean;
};

export function PlannerWorkspace({ plannerId, versionId, readOnly, listHref, autoBuild }: PlannerWorkspaceProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const buildStarted = useRef(false);
  const [editLesson, setEditLesson] = useState<PlannerLesson | null>(null);
  const [moveLesson, setMoveLesson] = useState<PlannerLesson | null>(null);
  const [moveDate, setMoveDate] = useState("");
  const [movePeriod, setMovePeriod] = useState("1");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["planner-version", plannerId, versionId],
    queryFn: () => academicPlannerService.getVersion(plannerId, versionId),
  });

  const generate = useMutation({
    mutationFn: () =>
      academicPlannerService.generateSchedule(plannerId, versionId, data!.version.revision),
    onSuccess: (payload) => {
      queryClient.setQueryData(["planner-version", plannerId, versionId], payload);
      if (autoBuild && typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (url.searchParams.has("build")) {
          url.searchParams.delete("build");
          window.history.replaceState(null, "", `${url.pathname}${url.search}`);
        }
      }
      toast({
        title: "Schedule ready",
        description: "Chapters were analyzed and lessons were placed on the calendar.",
        variant: "success",
      });
    },
    onError: async (err) => {
      if (err instanceof ApiClientError && err.status === 409) {
        try {
          const fresh = await academicPlannerService.getVersion(plannerId, versionId);
          queryClient.setQueryData(["planner-version", plannerId, versionId], fresh);
          if (fresh.lessons.length > 0) {
            toast({
              title: "Schedule ready",
              description: "The planner was already built. It is on the calendar.",
              variant: "success",
            });
            return;
          }
        } catch {
          // Fall through to the error toast.
        }
      }
      toast({
        title: "Could not generate schedule",
        description: friendlyApiErrorMessage(err),
        variant: "error",
      });
    },
  });

  useEffect(() => {
    if (!autoBuild || !data || buildStarted.current || generate.isPending) return;
    if (readOnly || !data.permissions.canEdit || data.version.origin === "RECOVERY") return;
    if (data.lessons.length > 0 || data.chapters.length === 0) return;
    buildStarted.current = true;
    generate.mutate();
  }, [autoBuild, data, generate, readOnly]);

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

  if (isLoading) return <PageLoader />;
  if (isError || !data) {
    return (
      <EmptyState
        title="Could not load planner"
        description={error instanceof Error ? error.message : "Try again later."}
      />
    );
  }

  const dayPlanLessons = [...data.lessons].sort((a, b) => {
    const da = a.dayNumber ?? a.sequence;
    const db = b.dayNumber ?? b.sequence;
    return da - db;
  });

  const chapterTitle = (chapterKey: string | null) => {
    if (!chapterKey) return null;
    const chapter = data.chapters.find((c) => String(c.chapterKey) === chapterKey);
    return chapter ? String(chapter.title) : null;
  };
  const plannerTitle = data.planner.title || `${data.planner.classLabel} — ${data.planner.subject.name}`;

  return (
    <div className="space-y-6">
      <PlannerPrintSheet
        title={plannerTitle}
        subtitle={`${data.planner.classLabel} · ${data.planner.subject.name} · Exam ${formatDate(data.planner.examDate)}`}
        lessons={dayPlanLessons}
        chapterTitle={chapterTitle}
      />
      <div className="print:hidden space-y-6">
      <PageHeader
        title={plannerTitle}
        description={`${data.planner.teacher.name} · ${formatStatusLabel(data.planner.examType)} · Exam ${formatDate(data.planner.examDate)}${readOnly ? " · View only" : ""}`}
        actions={
          <>
            {listHref && (
              <Link href={listHref}>
                <Button type="button" variant="outline" size="sm">
                  All planners
                </Button>
              </Link>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
              Print
            </Button>
            <Badge variant="secondary">
              v{data.version.versionNumber} · {formatStatusLabel(data.version.status)}
            </Badge>
          </>
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

      {!readOnly && data.permissions.canEdit && data.version.origin !== "RECOVERY" && !generate.isPending && (
        <div className="space-y-2">
          {!data.version.summary && (
            <p className="text-sm text-muted-foreground">
              Build the schedule in one step — we analyze each chapter and place lessons on your dates.
              Without a published timetable for this subject, assumed weekly periods apply (see warnings after
              building).
            </p>
          )}
          <Button
            type="button"
            size="sm"
            disabled={!data.chapters.length}
            onClick={() => generate.mutate()}
          >
            Build schedule
          </Button>
        </div>
      )}

      {generate.isPending ? (
        <AiWait kind="planner" />
      ) : (
      <PlannerMonthBoard
        plannerId={plannerId}
        versionId={versionId}
        lessons={dayPlanLessons}
        calendar={data.calendar}
        chapterTitle={chapterTitle}
        readOnly={readOnly}
        canEdit={data.permissions.canEdit}
        onEdit={readOnly || !data.permissions.canEdit ? undefined : (lesson) => setEditLesson(lesson)}
        onMove={
          readOnly || !data.permissions.canEdit
            ? undefined
            : (lesson) => {
                setMoveLesson(lesson);
                setMoveDate(lesson.date ?? data.calendar.from);
                setMovePeriod(String(lesson.periodNumber ?? 1));
              }
        }
      />
      )}

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
    </div>
  );
}
