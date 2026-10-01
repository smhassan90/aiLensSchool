"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { lessonsService } from "@/services/lessons.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { assetUrl } from "@/lib/api-client";
import { LESSON_MAX_PAGE_UPLOADS } from "@/lib/lesson-upload-limits";
import { compressPhotosForUpload } from "@/lib/page-ocr";
import { PageLoader } from "@/components/layout/page-loader";
import type { Lesson, LessonPageSource } from "@/lib/types";
import {
  createChapterPageUploadItems,
  releaseChapterPageUploadPreviews,
  uploadErrorMessage,
  uploadSingleChapterPage,
  type ChapterPageUploadItem,
} from "@/lib/chapter-page-upload";
import { ChevronDown, ChevronUp, ImagePlus, CheckCircle2, AlertCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

function isImageFile(file: File) {
  if (file.type.startsWith("image/")) return true;
  return IMAGE_EXT.test(file.name);
}

export function ChapterPageManager({
  lessonId,
  pageSources,
  initialUploadFiles,
  onContentUpdated,
}: {
  lessonId: string;
  pageSources: LessonPageSource[];
  initialUploadFiles?: File[];
  onContentUpdated: (lesson: Lesson) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [ordered, setOrdered] = useState<LessonPageSource[]>(pageSources);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [uploadQueue, setUploadQueue] = useState<ChapterPageUploadItem[]>([]);
  const uploadQueueRef = useRef<ChapterPageUploadItem[]>([]);
  const uploadRunning = useRef(false);
  const initialStarted = useRef(false);

  const setQueue = useCallback(
    (updater: ChapterPageUploadItem[] | ((prev: ChapterPageUploadItem[]) => ChapterPageUploadItem[])) => {
      setUploadQueue((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        uploadQueueRef.current = next;
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    setOrdered(pageSources);
  }, [pageSources]);

  useEffect(() => {
    return () => releaseChapterPageUploadPreviews(uploadQueueRef.current);
  }, []);

  const orderDirty = useMemo(() => {
    if (ordered.length !== pageSources.length) return true;
    return ordered.some((row, index) => row.id !== pageSources[index]?.id);
  }, [ordered, pageSources]);

  const syncFromProps = () => setOrdered(pageSources);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["lesson", lessonId] });
    queryClient.invalidateQueries({ queryKey: ["lesson-chapters"] });
  };

  const runNextUpload = useCallback(async () => {
    if (uploadRunning.current) return;
    const next = uploadQueueRef.current.find((item) => item.status === "queued");
    if (!next) return;

    uploadRunning.current = true;
    setQueue((current) =>
      current.map((item) =>
        item.id === next.id ? { ...item, status: "uploading", error: undefined } : item,
      ),
    );

    try {
      const lesson = await uploadSingleChapterPage(lessonId, next.file);
      URL.revokeObjectURL(next.previewUrl);
      setQueue((current) => current.filter((item) => item.id !== next.id));
      invalidate();
      onContentUpdated(lesson);
    } catch (err) {
      const message = uploadErrorMessage(err);
      setQueue((current) =>
        current.map((item) =>
          item.id === next.id ? { ...item, status: "failed", error: message } : item,
        ),
      );
      toast({
        title: `Page “${next.file.name}” failed`,
        description: message,
        variant: "error",
      });
    } finally {
      uploadRunning.current = false;
      if (uploadQueueRef.current.some((item) => item.status === "queued")) {
        void runNextUpload();
      }
    }
  }, [lessonId, onContentUpdated, setQueue, toast]);

  const enqueueUploads = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const compressed = await compressPhotosForUpload(files);
      const items = createChapterPageUploadItems(compressed);
      setQueue((current) => [...current, ...items]);
      setPendingPhotos([]);
      void runNextUpload();
    },
    [runNextUpload, setQueue],
  );

  useEffect(() => {
    if (!initialUploadFiles?.length || initialStarted.current) return;
    initialStarted.current = true;
    void enqueueUploads(initialUploadFiles);
  }, [initialUploadFiles, enqueueUploads]);

  const retryUpload = (id: string) => {
    setQueue((current) =>
      current.map((item) =>
        item.id === id ? { ...item, status: "queued", error: undefined } : item,
      ),
    );
    void runNextUpload();
  };

  const appendText = useMutation({
    mutationFn: () => lessonsService.appendChapterText(lessonId, pasteText.trim()),
    onSuccess: (lesson) => {
      setPasteText("");
      setPasteOpen(false);
      invalidate();
      onContentUpdated(lesson);
      toast({ title: "Text added", variant: "success" });
    },
    onError: (err) =>
      toast({
        title: "Could not add text",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      }),
  });

  const saveOrder = useMutation({
    mutationFn: () => lessonsService.reorderChapterPages(lessonId, ordered.map((p) => p.id)),
    onSuccess: (lesson) => {
      invalidate();
      onContentUpdated(lesson);
      toast({ title: "Page order saved", variant: "success" });
    },
    onError: (err) =>
      toast({
        title: "Could not save order",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      }),
  });

  const move = (index: number, direction: -1 | 1) => {
    const next = [...ordered];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrdered(next);
  };

  const queueBusy = uploadQueue.some((item) => item.status === "uploading" || item.status === "queued");
  const busy = queueBusy || appendText.isPending || saveOrder.isPending;

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-base">Pages &amp; more content</CardTitle>
        <CardDescription>
          Add more photos or pasted text below what you already have. Reorder page photos so the text matches the book.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {ordered.length > 0 || uploadQueue.length > 0 ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>
                Page photos ({ordered.length}
                {uploadQueue.length ? ` · ${uploadQueue.length} in progress` : ""})
              </Label>
              {orderDirty ? (
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={syncFromProps}>
                    Reset order
                  </Button>
                  <Button type="button" size="sm" disabled={saveOrder.isPending} onClick={() => saveOrder.mutate()}>
                    Save page order
                  </Button>
                </div>
              ) : null}
            </div>
            <ul className="space-y-2">
              {ordered.map((page, index) => {
                const src = assetUrl(page.url);
                return (
                  <li
                    key={page.id}
                    className="flex items-center gap-3 rounded-lg border bg-muted/20 p-2"
                  >
                    <span className="w-8 shrink-0 text-center text-sm font-medium tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>
                    {src ? (
                      <img src={src} alt="" className="h-16 w-12 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="h-16 w-12 shrink-0 rounded bg-muted" />
                    )}
                    <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-xs text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden />
                      <span className="truncate">{page.label}</span>
                      <span className="shrink-0 text-green-700">Uploaded</span>
                    </span>
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={index === 0 || queueBusy}
                        onClick={() => move(index, -1)}
                        aria-label="Move page up"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={index === ordered.length - 1 || queueBusy}
                        onClick={() => move(index, 1)}
                        aria-label="Move page down"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
              {uploadQueue.map((item, queueIndex) => (
                <li
                  key={item.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-2",
                    item.status === "failed" ? "border-destructive/40 bg-destructive/5" : "bg-muted/10",
                  )}
                >
                  <span className="w-8 shrink-0 text-center text-sm font-medium tabular-nums text-muted-foreground">
                    {ordered.length + queueIndex + 1}
                  </span>
                  <img src={item.previewUrl} alt="" className="h-16 w-12 shrink-0 rounded object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      {item.status === "uploading" ? (
                        <span className="text-muted-foreground">Reading page…</span>
                      ) : item.status === "failed" ? (
                        <>
                          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
                          <span className="text-destructive">Failed</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Waiting…</span>
                      )}
                      <span className="truncate text-muted-foreground">{item.file.name}</span>
                    </div>
                    {item.error ? (
                      <p className="mt-1 line-clamp-2 text-xs text-destructive">{item.error}</p>
                    ) : null}
                  </div>
                  {item.status === "failed" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={queueBusy}
                      onClick={() => retryUpload(item.id)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Retry
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This chapter was added by pasting text. You can still append more text or add photos below.
          </p>
        )}

        <div className="space-y-2 border-t pt-4">
          <Label>Add more photos</Label>
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-6",
              busy && "pointer-events-none opacity-50",
            )}
          >
            <ImagePlus className="mb-2 h-7 w-7 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Up to {LESSON_MAX_PAGE_UPLOADS} photos per batch · each page uploads separately
              {pendingPhotos.length ? ` · ${pendingPhotos.length} selected` : ""}
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const next = Array.from(e.target.files ?? []).filter(isImageFile);
                e.target.value = "";
                setPendingPhotos((current) => {
                  const merged = [...current, ...next].slice(0, LESSON_MAX_PAGE_UPLOADS);
                  if (merged.length < current.length + next.length) {
                    toast({
                      title: `Maximum ${LESSON_MAX_PAGE_UPLOADS} photos per batch`,
                      variant: "error",
                    });
                  }
                  return merged;
                });
              }}
            />
          </label>
          {pendingPhotos.length > 0 && (
            <Button type="button" disabled={busy} onClick={() => void enqueueUploads(pendingPhotos)}>
              Read text from {pendingPhotos.length} new photo{pendingPhotos.length === 1 ? "" : "s"}
            </Button>
          )}
        </div>

        <div className="space-y-2 border-t pt-4">
          <Button type="button" variant="outline" size="sm" onClick={() => setPasteOpen((v) => !v)}>
            {pasteOpen ? "Hide pasted text" : "Add pasted text"}
          </Button>
          {pasteOpen ? (
            <>
              <Textarea
                rows={8}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste additional paragraphs from the book…"
              />
              <Button
                type="button"
                disabled={busy || !pasteText.trim()}
                onClick={() => appendText.mutate()}
              >
                Append to chapter
              </Button>
            </>
          ) : null}
        </div>

        {appendText.isPending || saveOrder.isPending ? <PageLoader variant="panel" /> : null}
      </CardContent>
    </Card>
  );
}
