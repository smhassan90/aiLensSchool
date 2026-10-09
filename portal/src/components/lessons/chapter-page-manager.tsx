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
import { fetchImageUrlAsFile, rotateImageFile, type RotateDegrees } from "@/lib/rotate-image";
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
  RotateCw,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type OcrEngineStepStatus,
  type OcrUploadProgressSnapshot,
  ocrStepLabel,
} from "@/lib/ocr-upload-progress";

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

function chapterPageEngineReady(page: LessonPageSource, kind: OcrPreviewKind): boolean {
  if (kind === "paddle") return Boolean(page.ocrPaddleReady ?? page.paddleOcrText?.trim());
  if (kind === "tesseract") return Boolean(page.ocrTesseractReady ?? page.tesseractOcrText?.trim());
  return Boolean(page.ocrMergedReady ?? page.mergedOcrText?.trim() ?? page.fetchedText?.trim());
}

function OcrPipelineStatus({
  progress,
  compact,
}: {
  progress: OcrUploadProgressSnapshot;
  compact?: boolean;
}) {
  const rows: Array<{ key: string; status: OcrEngineStepStatus }> = [
    { key: "PaddleOCR", status: progress.paddle },
    { key: "Tesseract", status: progress.tesseract },
    { key: "Merge", status: progress.merge },
  ];
  return (
    <div className={cn("space-y-1", compact ? "text-[11px]" : "text-xs")}>
      <p className="font-medium text-foreground">{progress.message}</p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
        {rows.map((row) => (
          <li key={row.key} className="inline-flex items-center gap-1">
            {row.status === "running" ? (
              <Loader2 className="h-3 w-3 animate-spin text-primary" aria-hidden />
            ) : null}
            <span>{row.key}:</span>
            <span className="text-foreground">{ocrStepLabel(row.status)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function startOcrProgressPolling(
  lessonId: string,
  uploadId: string,
  onUpdate: (snap: OcrUploadProgressSnapshot) => void,
) {
  const timer = window.setInterval(() => {
    void lessonsService.getChapterOcrUploadProgress(lessonId, uploadId).then(onUpdate).catch(() => {
      /* ignore poll errors */
    });
  }, 450);
  return () => window.clearInterval(timer);
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
  const orderedIdsRef = useRef<Set<string>>(new Set());
  const uploadRunning = useRef(false);
  const initialStarted = useRef(false);
  const orderSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [orderSaving, setOrderSaving] = useState(false);
  const [reuploadSourceId, setReuploadSourceId] = useState<string | null>(null);
  const [reuploadOcrProgress, setReuploadOcrProgress] = useState<OcrUploadProgressSnapshot | null>(
    null,
  );
  const reuploadInputRef = useRef<HTMLInputElement>(null);
  type ReuploadTarget =
    | { kind: "saved"; sourceId: string }
    | { kind: "queue"; itemId: string };
  const reuploadTargetRef = useRef<ReuploadTarget | null>(null);
  type OrientationPrompt =
    | {
        kind: "saved";
        sourceId: string;
        pageNumber: number;
        label: string;
        src: string;
        reason: string;
      }
    | {
        kind: "queue";
        itemId: string;
        pageNumber: number;
        label: string;
        src: string;
        reason: string;
      }
    | {
        kind: "pending";
        index: number;
        pageNumber: number;
        label: string;
        src: string;
        reason: string;
      };
  const [orientationPrompt, setOrientationPrompt] = useState<OrientationPrompt | null>(null);
  const [orientationBusy, setOrientationBusy] = useState(false);
  const [pendingPreviews, setPendingPreviews] = useState<{ name: string; url: string }[]>([]);

  useEffect(() => {
    const next = pendingPhotos.map((file) => ({
      name: file.name,
      url: URL.createObjectURL(file),
    }));
    setPendingPreviews(next);
    return () => next.forEach((p) => URL.revokeObjectURL(p.url));
  }, [pendingPhotos]);

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
    orderedIdsRef.current = new Set(pageSources.map((p) => p.id));
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

    const uploadId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `upload-${Date.now()}`;
    const stopPoll = startOcrProgressPolling(lessonId, uploadId, (snap) => {
      applyQueue((current) =>
        current.map((item) =>
          item.id === next.id ? { ...item, ocrProgress: snap } : item,
        ),
      );
    });
    try {
      const lesson = await uploadSingleChapterPage(lessonId, next.file, uploadId);
      URL.revokeObjectURL(next.previewUrl);
      applyQueue((current) => current.filter((item) => item.id !== next.id));
      invalidate();
      onContentUpdated(lesson);
      const newest =
        lesson.pageSources?.find((p) => !orderedIdsRef.current.has(p.id)) ??
        lesson.pageSources?.[lesson.pageSources.length - 1];
      if (newest && !pageTextAccepted(newest)) {
        const src = assetUrl(newest.url);
        if (src) {
          const pageNumber =
            (lesson.pageSources?.findIndex((p) => p.id === newest.id) ?? -1) + 1 || 1;
          setOrientationPrompt({
            kind: "saved",
            sourceId: newest.id,
            pageNumber,
            label: newest.label || next.file.name,
            src,
            reason:
              "The text result is not good enough. Check that the page is upright, then rotate if needed and read again.",
          });
        }
      }
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
      setOrientationPrompt({
        kind: "queue",
        itemId: next.id,
        pageNumber: ordered.length + uploadQueueRef.current.findIndex((i) => i.id === next.id) + 1,
        label: next.file.name,
        src: next.previewUrl,
        reason:
          "Could not read this photo clearly. Check its orientation — rotate it upright, then try again.",
      });
    } finally {
      stopPoll();
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
    setReuploadOcrProgress(null);
    const uploadId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `reupload-${Date.now()}`;
    const stopPoll = startOcrProgressPolling(lessonId, uploadId, setReuploadOcrProgress);
    try {
      const compressed = await compressPhotosForUpload([file]);
      const lesson = await lessonsService.replaceChapterPagePhoto(
        lessonId,
        sourceId,
        compressed[0] ?? file,
        uploadId,
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
            "Some of this page was read. Check orientation or re-upload a sharper photo if lines are missing.",
          variant: "warning",
        });
        const src = assetUrl(updated.url);
        if (src) {
          setOrientationPrompt({
            kind: "saved",
            sourceId: sourceId,
            pageNumber: (ordered.findIndex((p) => p.id === sourceId) + 1) || 1,
            label: updated.label,
            src,
            reason:
              "The text result is not good enough. Check that the page is upright, then rotate if needed and read again.",
          });
        }
      } else {
        toast({
          title: "Photo still unclear",
          description: "Check orientation, or try a sharper photo with the full page flat and well lit.",
          variant: "error",
        });
        const src = assetUrl(updated?.url) ?? assetUrl(ordered.find((p) => p.id === sourceId)?.url);
        if (src) {
          setOrientationPrompt({
            kind: "saved",
            sourceId,
            pageNumber: (ordered.findIndex((p) => p.id === sourceId) + 1) || 1,
            label: updated?.label ?? "Page photo",
            src,
            reason:
              "Could not read this page clearly. Check its orientation — rotate it upright, then read again.",
          });
        }
      }
    } catch (err) {
      toast({
        title: "Could not read this page",
        description: uploadErrorMessage(err),
        variant: "error",
      });
      const page = ordered.find((p) => p.id === sourceId);
      const src = assetUrl(page?.url);
      if (src && page) {
        setOrientationPrompt({
          kind: "saved",
          sourceId,
          pageNumber: (ordered.findIndex((p) => p.id === sourceId) + 1) || 1,
          label: page.label,
          src,
          reason:
            "Could not read this page clearly. Check its orientation — rotate it upright, then read again.",
        });
      }
    } finally {
      stopPoll();
      setReuploadSourceId(null);
      setReuploadOcrProgress(null);
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

  const rotatePendingPhoto = async (index: number, degrees: RotateDegrees) => {
    const file = pendingPhotos[index];
    if (!file) return;
    setOrientationBusy(true);
    try {
      const rotated = await rotateImageFile(file, degrees);
      setPendingPhotos((current) => current.map((f, i) => (i === index ? rotated : f)));
    } catch (err) {
      toast({
        title: "Could not rotate photo",
        description: err instanceof Error ? err.message : "Unexpected error",
        variant: "error",
      });
    } finally {
      setOrientationBusy(false);
    }
  };

  const rotateQueueItem = async (itemId: string, degrees: RotateDegrees) => {
    const target = uploadQueueRef.current.find((item) => item.id === itemId);
    if (!target || target.status === "uploading") return;
    setOrientationBusy(true);
    try {
      const rotated = await rotateImageFile(target.file, degrees);
      const previewUrl = URL.createObjectURL(rotated);
      applyQueue((current) =>
        current.map((item) => {
          if (item.id !== itemId) return item;
          URL.revokeObjectURL(item.previewUrl);
          return {
            ...item,
            file: rotated,
            previewUrl,
            status: item.status === "failed" ? ("queued" as const) : item.status,
            error: undefined,
          };
        }),
      );
      if (target.status === "failed") {
        setOrientationPrompt(null);
        void runNextUpload();
      } else {
        setOrientationPrompt((prev) =>
          prev?.kind === "queue" && prev.itemId === itemId
            ? { ...prev, src: previewUrl, label: rotated.name }
            : prev,
        );
      }
    } catch (err) {
      toast({
        title: "Could not rotate photo",
        description: err instanceof Error ? err.message : "Unexpected error",
        variant: "error",
      });
    } finally {
      setOrientationBusy(false);
    }
  };

  const rotateSavedPageAndReread = async (sourceId: string, degrees: RotateDegrees) => {
    const page = ordered.find((p) => p.id === sourceId);
    const src = assetUrl(page?.url);
    if (!page || !src) return;
    setOrientationBusy(true);
    try {
      const original = await fetchImageUrlAsFile(src, page.label || "page.jpg");
      const rotated = await rotateImageFile(original, degrees);
      setOrientationPrompt(null);
      await reuploadPage(sourceId, rotated);
    } catch (err) {
      toast({
        title: "Could not rotate page",
        description: err instanceof Error ? err.message : "Unexpected error",
        variant: "error",
      });
    } finally {
      setOrientationBusy(false);
    }
  };

  const openOrientationCheck = (page: LessonPageSource, pageNumber: number) => {
    const src = assetUrl(page.url);
    if (!src) return;
    setOrientationPrompt({
      kind: "saved",
      sourceId: page.id,
      pageNumber,
      label: page.label,
      src,
      reason:
        "Text result is not good. Check that the page is upright. Rotate if needed, then read again.",
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
          Each photo is read automatically. Make sure pages look upright before reading — use Rotate if a photo is
          sideways. A green badge means the page is clear enough to compile. If text looks wrong, check orientation
          and rotate, or re-upload a clearer photo.
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
                const liveOcr =
                  reading && reuploadOcrProgress ? reuploadOcrProgress : null;
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
                        className="group relative h-44 w-32 shrink-0 overflow-hidden rounded-md border bg-muted/20 ring-offset-2 transition hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:h-52 sm:w-36"
                        onClick={() => openPreview(page.id)}
                        aria-label={`Enlarge page ${index + 1}: ${page.label}`}
                      >
                        <img src={src} alt="" className="h-full w-full object-contain" />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/25">
                          <ZoomIn className="h-5 w-5 text-white opacity-0 drop-shadow group-hover:opacity-100" />
                        </span>
                      </button>
                    ) : (
                      <div className="h-44 w-32 shrink-0 rounded-md bg-muted sm:h-52 sm:w-36" />
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
                      {liveOcr ? (
                        <div className="rounded-md border border-primary/20 bg-primary/5 p-2">
                          <OcrPipelineStatus progress={liveOcr} compact />
                        </div>
                      ) : null}
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
                            disabled={
                              reading || !chapterPageEngineReady(page, preview.key)
                            }
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
                        {!reading ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5"
                              disabled={queueBusy || orientationBusy}
                              onClick={() => openOrientationCheck(page, index + 1)}
                            >
                              <RotateCw className="h-3.5 w-3.5" aria-hidden />
                              Check orientation
                            </Button>
                            {!accepted ? (
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
                          </>
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
                    className="group relative h-44 w-32 shrink-0 overflow-hidden rounded-md border bg-muted/20 ring-offset-2 transition hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:h-52 sm:w-36"
                    onClick={() => openPreview(item.id)}
                    aria-label={`Enlarge ${item.file.name}`}
                  >
                    <img src={item.previewUrl} alt="" className="h-full w-full object-contain" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/25">
                      <ZoomIn className="h-5 w-5 text-white opacity-0 drop-shadow group-hover:opacity-100" />
                    </span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {item.status === "uploading" ? (
                        <Badge variant="secondary" className="gap-1 border-primary/30 bg-primary/10 text-primary">
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                          OCR in progress…
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
                    {item.ocrProgress ? (
                      <div className="mt-2 rounded-md border border-primary/20 bg-primary/5 p-2">
                        <OcrPipelineStatus progress={item.ocrProgress} compact />
                      </div>
                    ) : null}
                    {item.error ? (
                      <p className="mt-1 line-clamp-2 text-xs text-destructive">{item.error}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    {item.status === "failed" || item.status === "queued" ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0 gap-1.5"
                          disabled={orientationBusy || item.status === "uploading"}
                          onClick={() => void rotateQueueItem(item.id, 90)}
                        >
                          <RotateCw className="h-3.5 w-3.5" aria-hidden />
                          Rotate
                        </Button>
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
                      </>
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
          {pendingPhotos.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Check each photo is upright before reading. Tap Rotate if text looks sideways or upside-down.
              </p>
              <ul className="grid gap-3 sm:grid-cols-2">
                {pendingPreviews.map((preview, index) => (
                  <li key={preview.url} className="overflow-hidden rounded-lg border bg-muted/20 p-2">
                    <div className="flex min-h-[220px] items-center justify-center rounded-md bg-background/80 p-2 sm:min-h-[280px]">
                      <img
                        src={preview.url}
                        alt={preview.name}
                        className="max-h-[min(50vh,420px)] w-auto max-w-full object-contain"
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">{preview.name}</span>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1"
                          disabled={busy || orientationBusy}
                          onClick={() => void rotatePendingPhoto(index, 270)}
                          aria-label={`Rotate ${preview.name} left`}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Left
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1"
                          disabled={busy || orientationBusy}
                          onClick={() => void rotatePendingPhoto(index, 90)}
                          aria-label={`Rotate ${preview.name} right`}
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                          Right
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          disabled={busy}
                          onClick={() =>
                            setPendingPhotos((current) => current.filter((_, i) => i !== index))
                          }
                          aria-label={`Remove ${preview.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <Button type="button" disabled={busy || orientationBusy} onClick={() => void enqueueUploads(pendingPhotos)}>
                Read text from {pendingPhotos.length} new photo{pendingPhotos.length === 1 ? "" : "s"}
              </Button>
            </div>
          ) : null}
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
          className="max-h-[98vh] max-w-5xl overflow-y-auto"
          onClose={() => setPreviewIndex(null)}
        >
          {activePreview ? (
            <>
              <DialogHeader>
                <DialogTitle>Page {activePreview.pageNumber}</DialogTitle>
                <DialogDescription>
                  {activePreview.label}. Check that the page is upright before reading.
                </DialogDescription>
              </DialogHeader>
              <div className="flex min-h-[50vh] justify-center rounded-lg border bg-muted/30 p-2 sm:p-4">
                <img
                  src={activePreview.src}
                  alt={activePreview.label}
                  className="max-h-[min(78vh,900px)] w-auto max-w-full object-contain"
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
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
                  {activePreview.kind === "queue" ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={orientationBusy}
                        onClick={() => void rotateQueueItem(activePreview.key, 270)}
                      >
                        <RotateCcw className="h-4 w-4" />
                        Rotate left
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={orientationBusy}
                        onClick={() => void rotateQueueItem(activePreview.key, 90)}
                      >
                        <RotateCw className="h-4 w-4" />
                        Rotate right
                      </Button>
                    </>
                  ) : null}
                  {activePreview.kind === "saved" && activePreview.savedIndex !== undefined ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={orientationBusy || queueBusy || Boolean(reuploadSourceId)}
                        onClick={() =>
                          void rotateSavedPageAndReread(
                            ordered[activePreview.savedIndex!]?.id ?? activePreview.key,
                            270,
                          )
                        }
                      >
                        <RotateCcw className="h-4 w-4" />
                        Rotate left &amp; read
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={orientationBusy || queueBusy || Boolean(reuploadSourceId)}
                        onClick={() =>
                          void rotateSavedPageAndReread(
                            ordered[activePreview.savedIndex!]?.id ?? activePreview.key,
                            90,
                          )
                        }
                      >
                        <RotateCw className="h-4 w-4" />
                        Rotate right &amp; read
                      </Button>
                    </>
                  ) : null}
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
              {orientationBusy ? (
                <p className="mt-2 text-center text-xs text-muted-foreground">Rotating photo…</p>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={orientationPrompt !== null}
        onOpenChange={(open) => !open && !orientationBusy && setOrientationPrompt(null)}
      >
        <DialogContent
          className="max-h-[98vh] max-w-3xl overflow-y-auto"
          onClose={() => !orientationBusy && setOrientationPrompt(null)}
        >
          {orientationPrompt ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600" aria-hidden />
                  Check page orientation
                </DialogTitle>
                <DialogDescription>
                  Page {orientationPrompt.pageNumber} — {orientationPrompt.label}
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm text-foreground">{orientationPrompt.reason}</p>
              <div className="mt-3 flex min-h-[45vh] justify-center rounded-lg border bg-muted/30 p-3">
                <img
                  src={orientationPrompt.src}
                  alt={orientationPrompt.label}
                  className="max-h-[min(70vh,800px)] w-auto max-w-full object-contain"
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={orientationBusy}
                  onClick={() => {
                    if (orientationPrompt.kind === "saved") {
                      void rotateSavedPageAndReread(orientationPrompt.sourceId, 270);
                    } else if (orientationPrompt.kind === "queue") {
                      void rotateQueueItem(orientationPrompt.itemId, 270);
                    } else {
                      void rotatePendingPhoto(orientationPrompt.index, 270);
                    }
                  }}
                >
                  <RotateCcw className="h-4 w-4" />
                  Rotate left
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={orientationBusy}
                  onClick={() => {
                    if (orientationPrompt.kind === "saved") {
                      void rotateSavedPageAndReread(orientationPrompt.sourceId, 90);
                    } else if (orientationPrompt.kind === "queue") {
                      void rotateQueueItem(orientationPrompt.itemId, 90);
                    } else {
                      void rotatePendingPhoto(orientationPrompt.index, 90);
                    }
                  }}
                >
                  <RotateCw className="h-4 w-4" />
                  Rotate right
                </Button>
                {orientationPrompt.kind === "saved" ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={orientationBusy || queueBusy}
                    onClick={() => {
                      const id = orientationPrompt.sourceId;
                      setOrientationPrompt(null);
                      promptReupload(id);
                    }}
                  >
                    <FileImage className="h-4 w-4" />
                    Re-upload different photo
                  </Button>
                ) : null}
                {orientationPrompt.kind === "queue" ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={orientationBusy || queueBusy}
                    onClick={() => {
                      const id = orientationPrompt.itemId;
                      setOrientationPrompt(null);
                      promptFailedQueueReupload(id);
                    }}
                  >
                    <FileImage className="h-4 w-4" />
                    Re-upload different photo
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  disabled={orientationBusy}
                  onClick={() => setOrientationPrompt(null)}
                >
                  Dismiss
                </Button>
              </div>
              {orientationBusy ? (
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Applying rotation…
                </p>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
