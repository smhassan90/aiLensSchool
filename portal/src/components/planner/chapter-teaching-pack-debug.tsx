"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  academicPlannerService,
  type ChapterTeachingPackDebugPayload,
} from "@/services/academic-planner.service";
import { friendlyApiErrorMessage } from "@/lib/display-labels";

type DebugField = {
  key: string;
  label: string;
  value: (payload: ChapterTeachingPackDebugPayload) => unknown;
};

const LIBRARY_FIELDS: DebugField[] = [
  { key: "chapterMeta", label: "Chapter meta", value: (p) => p.chapter },
  { key: "summary", label: "Summary", value: (p) => p.pack?.summary ?? null },
  { key: "teacherGuide", label: "Teacher guide", value: (p) => p.pack?.teacherGuide ?? null },
  { key: "complexity", label: "Complexity", value: (p) => p.pack?.complexity ?? null },
  { key: "packHash", label: "Pack content hash", value: (p) => p.pack?.contentHash ?? null },
  { key: "chapterHash", label: "Chapter content hash", value: (p) => p.chapter.contentHash },
  { key: "hashMatch", label: "Hash match", value: (p) => p.pack?.hashMatchesChapter ?? false },
  { key: "source", label: "Source", value: (p) => p.pack?.source ?? null },
  { key: "promptVersion", label: "Prompt version", value: (p) => p.pack?.promptVersion ?? null },
  { key: "warnings", label: "Warnings", value: (p) => p.pack?.warnings ?? null },
  { key: "generatedAt", label: "Generated at", value: (p) => p.pack?.generatedAt ?? null },
  { key: "readingSlices", label: "Reading slices", value: (p) => p.pack?.readingSlices ?? null },
  { key: "questions", label: "Questions", value: (p) => p.pack?.questions ?? null },
  { key: "activities", label: "Activities", value: (p) => p.pack?.activities ?? null },
  { key: "revisionPoints", label: "Revision points", value: (p) => p.pack?.revisionPoints ?? null },
];

const PLANNER_FIELDS: DebugField[] = [
  { key: "plannerChapter", label: "Planner chapter", value: (p) => p.plannerChapter ?? null },
  { key: "plannerAnalysis", label: "Planner analysis JSON", value: (p) => p.plannerChapter?.analysis ?? null },
  {
    key: "plannerHashMatch",
    label: "Planner ↔ pack hash",
    value: (p) => p.plannerChapter?.hashMatchesPack ?? null,
  },
];

type ChapterTeachingPackDebugProps =
  | {
      mode: "library";
      bookId: string;
      chapterId: string;
      chapterTitle?: string;
    }
  | {
      mode: "planner";
      plannerId: string;
      versionId: string;
      chapterKey: string;
      chapterTitle?: string;
    };

function formatDebugValue(value: unknown): string {
  if (value === null || value === undefined) return "(empty)";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export function ChapterTeachingPackDebug(props: ChapterTeachingPackDebugProps) {
  const [openField, setOpenField] = useState<{ label: string; text: string } | null>(null);

  const queryKey =
    props.mode === "library"
      ? ["teaching-pack-debug", props.bookId, props.chapterId]
      : ["teaching-pack-debug", props.plannerId, props.versionId, props.chapterKey];

  const queryFn = () =>
    props.mode === "library"
      ? academicPlannerService.getChapterTeachingPackDebug(props.bookId, props.chapterId)
      : academicPlannerService.getPlannerChapterTeachingPackDebug(
          props.plannerId,
          props.versionId,
          props.chapterKey,
        );

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey,
    queryFn,
    enabled: false,
  });

  const fields = useMemo(
    () => (props.mode === "planner" ? [...LIBRARY_FIELDS, ...PLANNER_FIELDS] : LIBRARY_FIELDS),
    [props.mode],
  );

  const load = () => {
    void refetch();
  };

  const showField = (field: DebugField) => {
    if (!data) return;
    setOpenField({
      label: field.label,
      text: formatDebugValue(field.value(data)),
    });
  };

  return (
    <div className="mt-2 rounded-md border border-dashed border-amber-400/80 bg-amber-50/50 p-2 dark:bg-amber-950/20">
      <p className="text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:text-amber-200">
        Debug · teaching pack
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {!data && (
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={load} disabled={isFetching}>
            {isFetching ? "Loading…" : "Load pack data"}
          </Button>
        )}
        {data &&
          fields.map((field) => (
            <Button
              key={field.key}
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 text-xs"
              onClick={() => showField(field)}
            >
              {field.label}
            </Button>
          ))}
        {data && (
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={load} disabled={isFetching}>
            Refresh
          </Button>
        )}
      </div>
      {isLoading && <p className="mt-1 text-xs text-muted-foreground">Loading…</p>}
      {isError && (
        <p className="mt-1 text-xs text-destructive">{friendlyApiErrorMessage(error)}</p>
      )}
      {data && !data.pack && (
        <p className="mt-1 text-xs text-amber-900 dark:text-amber-100">No teaching pack in the library for this chapter.</p>
      )}

      <Dialog open={Boolean(openField)} onOpenChange={(open) => !open && setOpenField(null)}>
        <DialogContent className="max-w-2xl" onClose={() => setOpenField(null)}>
          <DialogHeader>
            <DialogTitle>{openField?.label ?? "Debug field"}</DialogTitle>
            {props.chapterTitle && <DialogDescription>{props.chapterTitle}</DialogDescription>}
          </DialogHeader>
          <pre className="max-h-[min(70dvh,28rem)] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">
            {openField?.text ?? ""}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
