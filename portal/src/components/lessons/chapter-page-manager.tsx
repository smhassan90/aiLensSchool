"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { lessonsService } from "@/services/lessons.service";
import { useToast } from "@/providers/toast-provider";
import { ApiClientError } from "@/lib/api-client";
import { assetUrl } from "@/lib/api-client";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronDown,
  ChevronUp,
  ImagePlus,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Loader2,
  FileImage,
  Sparkles,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PagePreviewEntry = {
  key: string;
  src: string;
  label: string;
  pageNumber: number;
  kind: "saved" | "queue";
  savedIndex?: number;
};

const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

function isImageFile(file: File) {
  if (file.type.startsWith("image/")) return true;
  return IMAGE_EXT.test(file.name);
}

function pageTextAccepted(page: LessonPageSource): boolean {
  if (page.textAccepted !== undefined) return page.textAccepted;
  return Boolean(page.fetchedText?.trim());
}

type OcrPreviewKind = "paddle" | "tesseract" | "merged";

function chapterPageOcrPreviewText(page: LessonPageSource, kind: OcrPreviewKind): string {
  if (kind === "paddle") return page.paddleOcrText?.trim() ?? "";
  if (kind === "tesseract") return page.tesseractOcrText?.trim() ?? "";
  return page.mergedOcrText?.trim() ?? page.fetchedText?.trim() ?? "";
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
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [pageTextView, setPageTextView] = useState<{
    pageNumber: number;
    label: string;
    title: string;
    text: string;
  } | null>(null);
  const uploadQueueRef = useRef<ChapterPageUploadItem[]>([]);
  const uploadRunning = useRef(false);
  const initialStarted = useRef(false);
  const orderSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [orderSaving, setOrderSaving] = useState(false);
  const [reuploadSourceId, setReuploadSourceId] = useState<string | null>(null);
  const reuploadInputRef = useRef<HTMLInputElement>(null);
  type ReuploadTarget =
    | { kind: "saved"; sourceId: string }
    | { kind: "queue"; itemId: string };
  const reuploadTargetRef = useRef<ReuploadTarget | null>(null);

  /** Update queue state and ref synchronously so runNextUpload never sees a stale "failed" list. */
  const applyQueue = useCallback(
    (updater: ChapterPageUploadItem[] | ((prev: ChapterPageUploadItem[]) => ChapterPageUploadItem[])) => {
      const prev = uploadQueueRef.current;
      const next = typeof updater === "function" ? updater(prev) : updater;
      uploadQueueRef.current = next;
      setUploadQueue(next);
      return next;
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
    applyQueue((current) =>
      current.map((item) =>
        item.id === next.id ? { ...item, status: "uploading", error: undefined } : item,
      ),
    );

    try {
      const lesson = await uploadSingleChapterPage(lessonId, next.file);
      URL.revokeObjectURL(next.previewUrl);
      applyQueue((current) => current.filter((item) => item.id !== next.id));
      invalidate();
      onContentUpdated(lesson);
    } catch (err) {
      const message = uploadErrorMessage(err);
      applyQueue((current) =>
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
  }, [applyQueue, lessonId, onContentUpdated, toast]);

  const enqueueUploads = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const compressed = await compressPhotosForUpload(files);
      const items = createChapterPageUploadItems(compressed);
      applyQueue((current) => [...current, ...items]);
      setPendingPhotos([]);
      void runNextUpload();
    },
    [applyQueue, runNextUpload],
  );

  useEffect(() => {
    if (!initialUploadFiles?.length || initialStarted.current) return;
    initialStarted.current = true;
    void enqueueUploads(initialUploadFiles);
  }, [initialUploadFiles, enqueueUploads]);

  // Safety net: if items sit in "queued" (e.g. after re-upload), kick the runner.
  useEffect(() => {
    if (uploadRunning.current) return;
    if (!uploadQueue.some((item) => item.status === "queued")) return;
    void runNextUpload();
  }, [uploadQueue, runNextUpload]);

  const reuploadPage = async (sourceId: string, file: File) => {
    setReuploadSourceId(sourceId);
    try {
      const compressed = await compressPhotosForUpload([file]);
      const lesson = await lessonsService.replaceChapterPagePhoto(
        lessonId,
        sourceId,
        compressed[0] ?? file,
      );
      invalidate();
      onContentUpdated(lesson);
      const updated = lesson.pageSources?.find((p) => p.id === sourceId);
      if (updated && pageTextAccepted(updated)) {
        const pct = updated.textQualityPercent;
        toast({
          title: "Page read successfully",
          description:
            typeof pct === "number"
              ? `About ${pct}% of the text was captured clearly. Review the draft below and compile when ready.`
              : "Review the draft below and compile when ready.",
          variant: "success",
        });
      } else if (updated?.fetchedText?.trim()) {
        toast({
          title: "Partial text captured",
          description:
            "Some of this page was read. Edit the draft or re-upload a sharper photo if lines are missing.",
          variant: "warning",
        });
      } else {
        toast({
          title: "Photo still unclear",
          description: "Try a sharper photo with the full page flat and well lit.",
          variant: "error",
        });
      }
    } catch (err) {
      toast({
        title: "Could not read this page",
        description: uploadErrorMessage(err),
        variant: "error",
      });
    } finally {
      setReuploadSourceId(null);
      reuploadTargetRef.current = null;
    }
  };

  const promptReupload = (sourceId: string) => {
    reuploadTargetRef.current = { kind: "saved", sourceId };
    reuploadInputRef.current?.click();
  };

  const promptFailedQueueReupload = (itemId: string) => {
    reuploadTargetRef.current = { kind: "queue", itemId };
    reuploadInputRef.current?.click();
  };

  const replaceFailedQueuePhoto = async (itemId: string, file: File) => {
    const compressed = await compressPhotosForUpload([file]);
    const newFile = compressed[0] ?? file;
    applyQueue((current) =>
      current.map((item) => {
        if (item.id !== itemId) return item;
        URL.revokeObjectURL(item.previewUrl);
        return {
          ...item,
          file: newFile,
          previewUrl: URL.createObjectURL(newFile),
          status: "queued" as const,
          error: undefined,
        };
      }),
    );
    void runNextUpload();
  };

  const removeQueueItem = (itemId: string) => {
    applyQueue((current) => {
      const target = current.find((item) => item.id === itemId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== itemId);
    });
  };

  const deleteSavedPage = useMutation({
    mutationFn: (sourceId: string) => lessonsService.deleteChapterPagePhoto(lessonId, sourceId),
    onSuccess: (lesson) => {
      invalidate();
      onContentUpdated(lesson);
      toast({ title: "Page removed", variant: "success" });
    },
    onError: (err) =>
      toast({
        title: "Could not remove page",
        description: err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      }),
  });

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

  const persistOrder = useCallback(
    (nextOrder: LessonPageSource[]) => {
      if (orderSaveTimer.current) clearTimeout(orderSaveTimer.current);
      orderSaveTimer.current = setTimeout(() => {
        setOrderSaving(true);
        lessonsService
          .reorderChapterPages(lessonId, nextOrder.map((p) => p.id))
          .then((lesson) => {
            invalidate();
            onContentUpdated(lesson);
          })
          .catch((err) =>
            toast({
              title: "Could not save page order",
              description: err instanceof ApiClientError ? err.message : "Unexpected error",
              variant: "error",
            }),
          )
          .finally(() => setOrderSaving(false));
      }, 350);
    },
    [lessonId, onContentUpdated, toast],
  );

  useEffect(() => {
    return () => {
      if (orderSaveTimer.current) clearTimeout(orderSaveTimer.current);
    };
  }, []);

  const move = (index: number, direction: -1 | 1) => {
    const next = [...ordered];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrdered(next);
    persistOrder(next);
  };

  const queueBusy = uploadQueue.some((item) => item.status === "uploading" || item.status === "queued");
  const busy = queueBusy || appendText.isPending || orderSaving || deleteSavedPage.isPending;

  const previewPages = useMemo((): PagePreviewEntry[] => {
    const saved: PagePreviewEntry[] = [];
    ordered.forEach((page, index) => {
      const src = assetUrl(page.url);
      if (!src) return;
      saved.push({
        key: page.id,
        src,
        label: page.label,
        pageNumber: index + 1,
        kind: "saved",
        savedIndex: index,
      });
    });
    const queued: PagePreviewEntry[] = uploadQueue.map((item, queueIndex) => ({
      key: item.id,
      src: item.previewUrl,
      label: item.file.name,
      pageNumber: ordered.length + queueIndex + 1,
      kind: "queue" as const,
    }));
    return [...saved, ...queued];
  }, [ordered, uploadQueue]);

  const activePreview =
    previewIndex !== null && previewIndex >= 0 && previewIndex < previewPages.length
      ? previewPages[previewIndex]
      : null;

  const openPreview = (key: string) => {
    const index = previewPages.findIndex((page) => page.key === key);
    if (index >= 0) setPreviewIndex(index);
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-base">Pages &amp; more content</CardTitle>
        <CardDescription>
          Each photo is read automatically. A green badge means the page is clear enough to compile (poem and
          exercise pages may show a lower %). Re-upload if you see “needs clearer photo”. Reorder photos so compile
          follows the book.
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
              {orderDirty || orderSaving ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {orderSaving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      Updating page order…
                    </>
                  ) : (
                    <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={syncFromProps}>
                      Reset order
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
            <ul className="space-y-2">
              {ordered.map((page, index) => {
                const src = assetUrl(page.url);
                const accepted = pageTextAccepted(page);
                const reading = reuploadSourceId === page.id;
                const quality = page.textQualityPercent;
                return (
                  <li
                    key={page.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-2 transition-colors",
                      reading && "chapter-page-reading bg-primary/5",
                      accepted ? "border-emerald-200/80 bg-emerald-50/40" : "border-amber-200/80 bg-amber-50/30",
                    )}
                  >
                    <span className="w-8 shrink-0 text-center text-sm font-medium tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>
                    {src ? (
                      <button
                        type="button"
                        className="group relative h-16 w-12 shrink-0 overflow-hidden rounded ring-offset-2 transition hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        onClick={() => openPreview(page.id)}
                        aria-label={`Enlarge page ${index + 1}: ${page.label}`}
                      >
                        <img src={src} alt="" className="h-full w-full object-cover" />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/25">
                          <ZoomIn className="h-5 w-5 text-white opacity-0 drop-shadow group-hover:opacity-100" />
                        </span>
                      </button>
                    ) : (
                      <div className="h-16 w-12 shrink-0 rounded bg-muted" />
                    )}
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-xs font-medium text-foreground">{page.label}</span>
                        {reading ? (
                          <Badge variant="secondary" className="gap-1 border-primary/30 bg-primary/10 text-primary">
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                            Reading page…
                          </Badge>
                        ) : accepted ? (
                          <Badge
                            variant="secondary"
                            className="gap-1 border-emerald-300/80 bg-emerald-100 text-emerald-900"
                          >
                            <Sparkles className="h-3 w-3" aria-hidden />
                            Text captured
                            {typeof quality === "number" ? ` · ${quality}%` : ""}
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="gap-1 border-amber-300/80 bg-amber-100 text-amber-950"
                          >
                            <AlertCircle className="h-3 w-3" aria-hidden />
                            Needs clearer photo
                            {typeof quality === "number" && quality > 0 ? ` · ${quality}%` : ""}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            { key: "paddle" as const, label: "Text from PaddleOCR" },
                            { key: "tesseract" as const, label: "Text from Tesseract" },
                            { key: "merged" as const, label: "Merged text" },
                          ] as const
                        ).map((preview) => (
                          <Button
                            key={preview.key}
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8"
                            disabled={reading || !accepted}
                            onClick={() => {
                              const text = chapterPageOcrPreviewText(page, preview.key);
                              if (!text) {
                                toast({
                                  title: "No text for this engine",
                                  description:
                                    preview.key === "paddle" || preview.key === "tesseract"
                                      ? "Nothing is stored in the database for this engine yet. Re-upload the page photo to capture Paddle and Tesseract output."
                                      : "Re-upload a clearer photo if merged text should be available.",
                                  variant: "error",
                                });
                                return;
                              }
                              setPageTextView({
                                pageNumber: index + 1,
                                label: page.label,
                                title: preview.label,
                                text,
                              });
                            }}
                          >
                            {preview.label}
                          </Button>
                        ))}
                        {!accepted && !reading ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="h-8 gap-1.5"
                            disabled={queueBusy}
                            onClick={() => promptReupload(page.id)}
                          >
                            <FileImage className="h-3.5 w-3.5" aria-hidden />
                            Re-upload picture
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={index === 0 || queueBusy || reading || deleteSavedPage.isPending}
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
                        disabled={index === ordered.length - 1 || queueBusy || reading || deleteSavedPage.isPending}
                        onClick={() => move(index, 1)}
                        aria-label="Move page down"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        disabled={reading || queueBusy || deleteSavedPage.isPending}
                        onClick={() => {
                          if (
                            typeof window !== "undefined" &&
                            !window.confirm(`Remove page ${index + 1} (${page.label})?`)
                          ) {
                            return;
                          }
                          deleteSavedPage.mutate(page.id);
                        }}
                        aria-label={`Delete page ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
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
                    item.status === "uploading" && "chapter-page-reading bg-primary/5",
                    item.status === "failed"
                      ? "border-destructive/40 bg-destructive/5"
                      : item.status === "uploading"
                        ? "border-primary/40"
                        : "bg-muted/10",
                  )}
                >
                  <span className="w-8 shrink-0 text-center text-sm font-medium tabular-nums text-muted-foreground">
                    {ordered.length + queueIndex + 1}
                  </span>
                  <button
                    type="button"
                    className="group relative h-16 w-12 shrink-0 overflow-hidden rounded ring-offset-2 transition hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={() => openPreview(item.id)}
                    aria-label={`Enlarge ${item.file.name}`}
                  >
                    <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/25">
                      <ZoomIn className="h-5 w-5 text-white opacity-0 drop-shadow group-hover:opacity-100" />
                    </span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {item.status === "uploading" ? (
                        <Badge variant="secondary" className="gap-1 border-primary/30 bg-primary/10 text-primary">
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                          Reading text…
                        </Badge>
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
                  <div className="flex shrink-0 items-center gap-1">
                    {item.status === "failed" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 shrink-0 gap-1.5"
                        disabled={queueBusy}
                        onClick={() => promptFailedQueueReupload(item.id)}
                      >
                        <FileImage className="h-3.5 w-3.5" aria-hidden />
                        Re-upload picture
                      </Button>
                    ) : null}
                    {item.status !== "uploading" ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                        onClick={() => removeQueueItem(item.id)}
                        aria-label={`Remove ${item.file.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
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
              Add as many page photos as you need · each page uploads and is read separately
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
                setPendingPhotos((current) => [...current, ...next]);
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

        {appendText.isPending || orderSaving ? <PageLoader variant="panel" /> : null}

        <input
          ref={reuploadInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            const target = reuploadTargetRef.current;
            reuploadTargetRef.current = null;
            if (!file || !isImageFile(file) || !target) return;
            if (target.kind === "saved") {
              void reuploadPage(target.sourceId, file);
            } else {
              void replaceFailedQueuePhoto(target.itemId, file);
            }
          }}
        />
      </CardContent>

      <Dialog open={pageTextView !== null} onOpenChange={(open) => !open && setPageTextView(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" onClose={() => setPageTextView(null)}>
          {pageTextView ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  Page {pageTextView.pageNumber} — {pageTextView.title}
                </DialogTitle>
                <DialogDescription>{pageTextView.label}</DialogDescription>
              </DialogHeader>
              <Textarea
                readOnly
                rows={16}
                className="min-h-[12rem] font-sans leading-relaxed"
                dir={/[\u0600-\u06FF]/.test(pageTextView.text) ? "rtl" : "ltr"}
                value={pageTextView.text}
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={activePreview !== null} onOpenChange={(open) => !open && setPreviewIndex(null)}>
        <DialogContent
          className="max-h-[95vh] max-w-4xl overflow-y-auto"
          onClose={() => setPreviewIndex(null)}
        >
          {activePreview ? (
            <>
              <DialogHeader>
                <DialogTitle>Page {activePreview.pageNumber}</DialogTitle>
                <DialogDescription>{activePreview.label}</DialogDescription>
              </DialogHeader>
              <div className="flex justify-center rounded-lg border bg-muted/30 p-2 sm:p-4">
                <img
                  src={activePreview.src}
                  alt={activePreview.label}
                  className="max-h-[min(70vh,720px)] w-auto max-w-full object-contain"
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={previewIndex === 0}
                    onClick={() => setPreviewIndex((i) => (i !== null && i > 0 ? i - 1 : i))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={previewIndex === null || previewIndex >= previewPages.length - 1}
                    onClick={() =>
                      setPreviewIndex((i) =>
                        i !== null && i < previewPages.length - 1 ? i + 1 : i,
                      )
                    }
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                {activePreview.kind === "saved" && activePreview.savedIndex !== undefined ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={activePreview.savedIndex === 0 || queueBusy}
                      onClick={() => {
                        move(activePreview.savedIndex!, -1);
                        setPreviewIndex((i) => (i !== null && i > 0 ? i - 1 : i));
                      }}
                    >
                      <ChevronUp className="h-4 w-4" />
                      Move up
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={
                        activePreview.savedIndex === ordered.length - 1 || queueBusy
                      }
                      onClick={() => {
                        move(activePreview.savedIndex!, 1);
                        setPreviewIndex((i) =>
                          i !== null && i < previewPages.length - 1 ? i + 1 : i,
                        );
                      }}
                    >
                      Move down
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
              {orderSaving ? (
                <p className="mt-2 text-center text-xs text-muted-foreground">Saving new page order…</p>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
